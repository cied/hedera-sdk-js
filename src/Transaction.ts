import { Transaction as Transaction_ } from "./generated/Transaction_pb";
import { TransactionBody } from "./generated/TransactionBody_pb";
import { BaseClient, Signer } from "./BaseClient";
import { SignatureMap, SignaturePair, TransactionID } from "./generated/BasicTypes_pb";
import { grpc } from "@improbable-eng/grpc-web";
import { TransactionResponse } from "./generated/TransactionResponse_pb";
import { TransactionReceipt as ProtoTransactionReceipt } from "./generated/TransactionReceipt_pb";
import {
    handlePrecheck,
    handleQueryPrecheck,
    orThrow,
    setTimeoutAwaitable
} from "./util";
import { ResponseCodeEnum } from "./generated/ResponseCode_pb";
import { TransactionGetReceiptQuery } from "./generated/TransactionGetReceipt_pb";
import { Query } from "./generated/Query_pb";
import { Message } from "google-protobuf";
import { CryptoService } from "./generated/CryptoService_pb_service";
import { SmartContractService } from "./generated/SmartContractService_pb_service";
import { FileService } from "./generated/FileService_pb_service";
import { FreezeService } from "./generated/FreezeService_pb_service";
import { HederaError } from "./errors";
import UnaryMethodDefinition = grpc.UnaryMethodDefinition;
import { AccountId } from "./account/AccountId";
import { TransactionId } from "./TransactionId";
import { receiptToSdk, TransactionReceipt } from "./TransactionReceipt";
import { timestampToMs } from "./Timestamp";
import { Ed25519PublicKey } from "./crypto/Ed25519PublicKey";
import { Ed25519PrivateKey } from "./crypto/Ed25519PrivateKey";

/**
 * Signature/public key pairs are passed around as objects
 */
export interface SignatureAndKey {
    signature: Uint8Array;
    publicKey: Ed25519PublicKey;
}

const receiptInitialDelayMs = 1000;
const receiptRetryDelayMs = 500;

export class Transaction {
    private readonly _node: AccountId;
    private readonly _inner: Transaction_;
    private readonly _txnId: TransactionID;
    private readonly _validDurationSeconds: number;
    private readonly _method: UnaryMethodDefinition<Transaction_, TransactionResponse>;

    /**
     * NOT A STABLE API
     *
     * This constructor is not meant to be invoked from user code. It is only public for
     * access from `TransactionBuilder.ts`. Usage may be broken in backwards-compatible
     * version bumps.
     */
    public constructor(
        node: AccountId,
        inner: Transaction_,
        body: TransactionBody,
        method: UnaryMethodDefinition<Transaction_, TransactionResponse>
    ) {
        this._node = node;
        this._inner = inner;
        this._txnId = orThrow(body.getTransactionid());
        this._validDurationSeconds = orThrow(body.getTransactionvalidduration()).getSeconds();
        this._method = method;
    }

    public static fromBytes(bytes: Uint8Array): Transaction {
        const inner = Transaction_.deserializeBinary(bytes);
        const body = TransactionBody.deserializeBinary(inner.getBodybytes_asU8());

        const nodeId = AccountId.fromProto(orThrow(body.getNodeaccountid(), "transaction missing node account ID"));

        const method = methodFromTxn(body);

        return new Transaction(nodeId, inner, body, method);
    }

    public get id(): TransactionId {
        return TransactionId.fromProto(this._txnId);
    }

    private _addSignature({ signature, publicKey }: SignatureAndKey): this {
        const sigPair = new SignaturePair();
        sigPair.setPubkeyprefix(publicKey.toBytes());
        sigPair.setEd25519(signature);

        const sigMap = this._inner.getSigmap() || new SignatureMap();
        sigMap.addSigpair(sigPair);
        this._inner.setSigmap(sigMap);

        return this;
    }

    public sign(privateKey: Ed25519PrivateKey): this {
        return this._addSignature({
            signature: privateKey.sign(this._inner.getBodybytes_asU8()),
            publicKey: privateKey.publicKey
        });
    }

    /**
     * Given the transaction body bytes, asynchronously return a signature and associated public
     * key.
     *
     * @param publicKey the public key that can be used to verify the returned signature
     * @param signer
     */
    public async signWith(publicKey: Ed25519PublicKey, signer: Signer): Promise<this> {
        const signResult = signer(this._inner.getBodybytes_asU8());
        const signature: Uint8Array = signResult instanceof Promise ?
            await signResult :
            signResult;

        this._addSignature({ signature, publicKey });
        return this;
    }

    public async execute(client: BaseClient): Promise<TransactionId> {
        const node = client._getNode(this._node);
        handlePrecheck(await client._unaryCall(node.url, this._inner, this._method));

        return this.id;
    }

    public async getReceipt(client: BaseClient): Promise<TransactionReceipt> {
        return receiptToSdk(await this._waitForReceipt(client));
    }

    private _getReceipt(client: BaseClient): Promise<ProtoTransactionReceipt> {
        const receiptQuery = new TransactionGetReceiptQuery();
        receiptQuery.setTransactionid(this._txnId);
        const query = new Query();
        query.setTransactiongetreceipt(receiptQuery);

        const node = client._getNode(this._node);

        return client._unaryCall(node.url, query, CryptoService.getTransactionReceipts)
            .then(handleQueryPrecheck((resp) => resp.getTransactiongetreceipt()))
            .then((receipt) => orThrow(receipt.getReceipt()));
    }

    private async _waitForReceipt(client: BaseClient): Promise<ProtoTransactionReceipt> {
        const validStartMs = timestampToMs(orThrow(this._txnId.getTransactionvalidstart()));
        // set timeout at max valid duration
        const validUntilMs = validStartMs + 120000;

        await setTimeoutAwaitable(receiptInitialDelayMs);

        /* eslint-disable no-await-in-loop */
        // we want to wait in a loop, that's the whole point here
        for (let attempt = 0; /* loop will exit when transaction expires */; attempt += 1) {
            const receipt = await this._getReceipt(client);

            // typecast required or we get a mismatching union type error
            if (([ ResponseCodeEnum.UNKNOWN, ResponseCodeEnum.OK ] as number[])
                .includes(receipt.getStatus())) {
                const delay = Math.floor(receiptRetryDelayMs *
                    Math.random() * (2 ** attempt - 1));

                if (Date.now() + delay > validUntilMs) {
                    throw new Error(`timed out waiting for consensus on transaction ID: ${
                        this._txnId.toObject()}`);
                }

                await setTimeoutAwaitable(delay);
            } else if (receipt.getStatus() !== ResponseCodeEnum.SUCCESS) {
                throw new HederaError(receipt.getStatus());
            } else {
                return receipt;
            }
            /* eslint-enable no-await-in-loop */
        }
    }

    public toProto(): Transaction_ {
        return Message.cloneMessage(this._inner);
    }

    public toBytes(): Uint8Array {
        return this._inner.serializeBinary();
    }

    public toString(): string {
        const tx = this.toProto().toObject();
        const bodybytes = tx.bodybytes instanceof Uint8Array ?
            Buffer.from(tx.bodybytes) :
            Buffer.from(tx.bodybytes, "base64");
        tx.body = TransactionBody.deserializeBinary(bodybytes).toObject();

        return JSON.stringify(tx, null, 4);
    }
}

/* eslint-disable-next-line max-len */
function methodFromTxn(inner: TransactionBody): UnaryMethodDefinition<Transaction_, TransactionResponse> {
    switch (inner.getDataCase()) {
        case TransactionBody.DataCase.CONTRACTCALL:
            return SmartContractService.contractCallMethod;
        case TransactionBody.DataCase.CONTRACTCREATEINSTANCE:
            return SmartContractService.createContract;
        case TransactionBody.DataCase.CONTRACTUPDATEINSTANCE:
            return SmartContractService.updateContract;
        case TransactionBody.DataCase.CONTRACTDELETEINSTANCE:
            return SmartContractService.deleteContract;
        case TransactionBody.DataCase.CRYPTOADDCLAIM:
            return CryptoService.addClaim;
        case TransactionBody.DataCase.CRYPTOCREATEACCOUNT:
            return CryptoService.createAccount;
        case TransactionBody.DataCase.CRYPTODELETE:
            return CryptoService.cryptoDelete;
        case TransactionBody.DataCase.CRYPTODELETECLAIM:
            return CryptoService.deleteClaim;
        case TransactionBody.DataCase.CRYPTOTRANSFER:
            return CryptoService.cryptoTransfer;
        case TransactionBody.DataCase.CRYPTOUPDATEACCOUNT:
            return CryptoService.updateAccount;
        case TransactionBody.DataCase.FILEAPPEND:
            return FileService.appendContent;
        case TransactionBody.DataCase.FILECREATE:
            return FileService.createFile;
        case TransactionBody.DataCase.FILEDELETE:
            return FileService.deleteFile;
        case TransactionBody.DataCase.FILEUPDATE:
            return FileService.updateFile;
        case TransactionBody.DataCase.SYSTEMDELETE:
            return SmartContractService.systemDelete;
        case TransactionBody.DataCase.SYSTEMUNDELETE:
            return SmartContractService.systemUndelete;
        case TransactionBody.DataCase.FREEZE:
            return FreezeService.freeze;
        case TransactionBody.DataCase.DATA_NOT_SET:
            throw new Error("transaction body missing");
        default:
            throw new Error(`unsupported body case:${inner.getDataCase().toString()}`);
    }
}
