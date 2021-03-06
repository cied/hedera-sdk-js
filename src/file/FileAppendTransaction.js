import Transaction, {
    TRANSACTION_REGISTRY,
    CHUNK_SIZE,
} from "../transaction/Transaction.js";
import * as utf8 from "../encoding/utf8.js";
import FileId from "./FileId.js";
import TransactionId from "../transaction/TransactionId.js";
import Timestamp from "../Timestamp.js";

/**
 * @namespace proto
 * @typedef {import("@hashgraph/proto").ITransaction} proto.ITransaction
 * @typedef {import("@hashgraph/proto").TransactionBody} proto.TransactionBody
 * @typedef {import("@hashgraph/proto").ITransactionBody} proto.ITransactionBody
 * @typedef {import("@hashgraph/proto").ITransactionResponse} proto.ITransactionResponse
 * @typedef {import("@hashgraph/proto").IFileAppendTransactionBody} proto.IFileAppendTransactionBody
 * @typedef {import("@hashgraph/proto").IFileID} proto.IFileID
 */

/**
 * @typedef {import("../channel/Channel.js").default} Channel
 * @typedef {import("../account/AccountId.js").default} AccountId
 * @typedef {import("../transaction/TransactionResponse.js").default} TransactionResponse
 */

/**
 * A transaction specifically to append data to a file on the network.
 *
 * If a file has multiple keys, all keys must sign to modify its contents.
 */
export default class FileAppendTransaction extends Transaction {
    /**
     * @param {object} [props]
     * @param {FileId | string} [props.fileId]
     * @param {Uint8Array | string} [props.contents]
     * @param {number} [props.maxChunks]
     */
    constructor(props = {}) {
        super();

        /**
         * @private
         * @type {?FileId}
         */
        this._fileId = null;

        /**
         * @private
         * @type {?Uint8Array}
         */
        this._contents = null;

        if (props.fileId != null) {
            this.setFileId(props.fileId);
        }

        if (props.contents != null) {
            this.setContents(props.contents);
        }

        /**
         * @private
         * @type {number}
         */
        this._maxChunks = 10;

        if (props.maxChunks != null) {
            this.setMaxChunks(props.maxChunks);
        }

        /** @type {number} */
        this._startIndex = 0;

        /** @type {TransactionId[]} */
        this._transactionIds = [];
    }

    /**
     * @internal
     * @param {Map<string, Map<AccountId, proto.ITransaction>>} transactions
     * @param {proto.TransactionBody} body
     * @returns {FileAppendTransaction}
     */
    static _fromProtobuf(transactions, body) {
        const append = /** @type {proto.IFileAppendTransactionBody} */ (body.fileAppend);

        return Transaction._fromProtobufTransactions(
            new FileAppendTransaction({
                fileId:
                    append.fileID != null
                        ? FileId._fromProtobuf(
                              /** @type {proto.IFileID} */ (append.fileID)
                          )
                        : undefined,
                contents: append.contents != null ? append.contents : undefined,
            }),
            transactions,
            body
        );
    }

    /**
     * @returns {?FileId}
     */
    get fileId() {
        return this._fileId;
    }

    /**
     * Set the keys which must sign any transactions modifying this file. Required.
     *
     * All keys must sign to modify the file's contents or keys. No key is required
     * to sign for extending the expiration time (except the one for the operator account
     * paying for the transaction). Only one key must sign to delete the file, however.
     *
     * To require more than one key to sign to delete a file, add them to a
     * KeyList and pass that here.
     *
     * The network currently requires a file to have at least one key (or key list or threshold key)
     * but this requirement may be lifted in the future.
     *
     * @param {FileId | string} fileId
     * @returns {this}
     */
    setFileId(fileId) {
        this._requireNotFrozen();
        this._fileId =
            fileId instanceof FileId ? fileId : FileId.fromString(fileId);

        return this;
    }

    /**
     * @returns {?Uint8Array}
     */
    get contents() {
        return this._contents;
    }

    /**
     * Set the given byte array as the file's contents.
     *
     * This may be omitted to append an empty file.
     *
     * Note that total size for a given transaction is limited to 6KiB (as of March 2020) by the
     * network; if you exceed this you may receive a HederaPreCheckStatusException
     * with Status#TransactionOversize.
     *
     * In this case, you will need to break the data into chunks of less than ~6KiB and execute this
     * transaction with the first chunk and then use FileAppendTransaction with
     * FileAppendTransaction#setContents(Uint8Array) for the remaining chunks.
     *
     * @param {Uint8Array | string} contents
     * @returns {this}
     */
    setContents(contents) {
        this._requireNotFrozen();
        this._contents =
            contents instanceof Uint8Array ? contents : utf8.encode(contents);

        return this;
    }

    /**
     * @returns {?number}
     */
    get maxChunks() {
        return this._maxChunks;
    }

    /**
     * @param {number} maxChunks
     * @returns {this}
     */
    setMaxChunks(maxChunks) {
        this._requireNotFrozen();
        this._maxChunks = maxChunks;
        return this;
    }

    /**
     * Freeze this transaction from further modification to prepare for
     * signing or serialization.
     *
     * Will use the `Client`, if available, to generate a default Transaction ID and select 1/3
     * nodes to prepare this transaction for.
     *
     * @param {?import("../client/Client.js").default<Channel, *>} client
     * @returns {this}
     */
    freezeWith(client) {
        super.freezeWith(client);

        if (this._transactionId == null) {
            throw new Error("TransactionId not set when freezing");
        }

        this._transactionIds = [this._transactionId];

        if (this._contents == null) {
            return this;
        }

        if (this._contents.length < CHUNK_SIZE) {
            return this;
        }

        const chunks = Math.floor(
            (this._contents.length + (CHUNK_SIZE - 1)) / CHUNK_SIZE
        );

        if (chunks > this._maxChunks) {
            throw new Error(
                `Contents with size ${this._contents.length} too long for ${this._maxChunks} chunks`
            );
        }

        super._transactions = [];

        const initialTransactionId = this._transactionId;
        let nextTransactionId = this._transactionId;

        for (let chunk = 0; chunk < chunks; chunk++) {
            this._startIndex = chunk * CHUNK_SIZE;

            super._transactionId = nextTransactionId;
            this._transactionIds.push(nextTransactionId);

            for (const nodeAccountId of this._nodeIds) {
                this._transactions.push(this._makeTransaction(nodeAccountId));
            }

            nextTransactionId = new TransactionId(
                nextTransactionId.accountId,
                new Timestamp(
                    nextTransactionId.validStart.seconds.add(10),
                    nextTransactionId.validStart.nanos
                )
            );
        }

        super._transactionId = initialTransactionId;
        this._startIndex = 0;

        return this;
    }

    /**
     * @param {import("../client/Client.js").default<*, *>} client
     * @returns {Promise<TransactionResponse>}
     */
    async execute(client) {
        return (await this.executeAll(client))[0];
    }

    /**
     * @param {import("../client/Client.js").default<*, *>} client
     * @returns {Promise<TransactionResponse[]>}
     */
    async executeAll(client) {
        if (!super._isFrozen()) {
            this.freezeWith(client);
        }

        // on execute, sign each transaction with the operator, if present
        // and we are signing a transaction that used the default transaction ID

        const transactionId = this.transactionId;
        const operatorAccountId = client.operatorAccountId;

        if (
            operatorAccountId != null &&
            operatorAccountId.equals(transactionId.accountId)
        ) {
            await super.signWithOperator(client);
        }

        const transactionCount = Math.floor(
            this._transactions.length / this._nodeIds.length
        );
        const responses = [];
        for (
            this._nextGroupIndex = 0;
            this._nextGroupIndex < transactionCount;
            this._nextGroupIndex++
        ) {
            super._transactionId = this._transactionIds[this._nextGroupIndex];
            const response = await super.execute(client);
            await response.getReceipt(client);
            responses.push(response);
        }

        return responses;
    }

    /**
     * @override
     * @internal
     * @param {Channel} channel
     * @param {proto.ITransaction} request
     * @returns {Promise<proto.ITransactionResponse>}
     */
    _execute(channel, request) {
        return channel.file.appendContent(request);
    }

    /**
     * @override
     * @protected
     * @returns {NonNullable<proto.TransactionBody["data"]>}
     */
    _getTransactionDataCase() {
        return "fileAppend";
    }

    /**
     * @override
     * @protected
     * @returns {proto.IFileAppendTransactionBody}
     */
    _makeTransactionData() {
        const length = this._contents != null ? this._contents.length : 0;
        let endIndex = this._startIndex + CHUNK_SIZE;
        if (endIndex > length) {
            endIndex = length;
        }

        return {
            fileID: this._fileId != null ? this._fileId._toProtobuf() : null,
            contents:
                this._contents != null
                    ? this._contents.subarray(this._startIndex, endIndex)
                    : null,
        };
    }
}

// eslint-disable-next-line @typescript-eslint/unbound-method
TRANSACTION_REGISTRY.set("fileAppend", FileAppendTransaction._fromProtobuf);
