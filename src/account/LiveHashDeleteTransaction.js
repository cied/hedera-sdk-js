import Transaction, {
    TRANSACTION_REGISTRY,
} from "../transaction/Transaction.js";
import AccountId from "./AccountId.js";

/**
 * @namespace proto
 * @typedef {import("@hashgraph/proto").ITransaction} proto.ITransaction
 * @typedef {import("@hashgraph/proto").TransactionBody} proto.TransactionBody
 * @typedef {import("@hashgraph/proto").ITransactionBody} proto.ITransactionBody
 * @typedef {import("@hashgraph/proto").ITransactionResponse} proto.ITransactionResponse
 * @typedef {import("@hashgraph/proto").ICryptoDeleteLiveHashTransactionBody} proto.ICryptoDeleteLiveHashTransactionBody
 */

/**
 * @typedef {import("@hashgraph/cryptography").Key} Key
 * @typedef {import("../channel/Channel.js").default} Channel
 */

export default class LiveHashDeleteTransaction extends Transaction {
    /**
     * @param {object} [props]
     * @param {Uint8Array} [props.hash]
     * @param {AccountId | string} [props.accountId]
     */
    constructor(props = {}) {
        super();

        /**
         * @private
         * @type {?Uint8Array}
         */
        this._hash = null;

        /**
         * @private
         * @type {?AccountId}
         */
        this._accountId = null;

        if (props.hash != null) {
            this.setHash(props.hash);
        }

        if (props.accountId != null) {
            this.setAccountId(props.accountId);
        }
    }

    /**
     * @internal
     * @param {Map<string, Map<AccountId, proto.ITransaction>>} transactions
     * @param {proto.TransactionBody} body
     * @returns {LiveHashDeleteTransaction}
     */
    static _fromProtobuf(transactions, body) {
        const hashes = /** @type {proto.ICryptoDeleteLiveHashTransactionBody} */ (body.cryptoDeleteLiveHash);

        return Transaction._fromProtobufTransactions(
            new LiveHashDeleteTransaction({
                hash:
                    hashes.liveHashToDelete != null
                        ? hashes.liveHashToDelete
                        : undefined,
                accountId:
                    hashes.accountOfLiveHash != null
                        ? AccountId._fromProtobuf(hashes.accountOfLiveHash)
                        : undefined,
            }),
            transactions,
            body
        );
    }

    /**
     * @returns {?Uint8Array}
     */
    get hash() {
        return this._hash;
    }

    /**
     * @param {Uint8Array} hash
     * @returns {LiveHashDeleteTransaction}
     */
    setHash(hash) {
        this._requireNotFrozen();
        this._hash = hash;

        return this;
    }

    /**
     * @returns {?AccountId}
     */
    get accountId() {
        return this._accountId;
    }

    /**
     * @param {AccountId | string} accountId
     * @returns {LiveHashDeleteTransaction}
     */
    setAccountId(accountId) {
        this._requireNotFrozen();
        this._accountId =
            accountId instanceof AccountId
                ? accountId
                : AccountId.fromString(accountId);

        return this;
    }

    /**
     * @override
     * @internal
     * @param {Channel} channel
     * @param {proto.ITransaction} request
     * @returns {Promise<proto.ITransactionResponse>}
     */
    _execute(channel, request) {
        return channel.crypto.deleteLiveHash(request);
    }

    /**
     * @override
     * @protected
     * @returns {NonNullable<proto.TransactionBody["data"]>}
     */
    _getTransactionDataCase() {
        return "cryptoDeleteLiveHash";
    }

    /**
     * @override
     * @protected
     * @returns {proto.ICryptoDeleteLiveHashTransactionBody}
     */
    _makeTransactionData() {
        return {
            liveHashToDelete: this._hash,
            accountOfLiveHash:
                this._accountId != null ? this._accountId._toProtobuf() : null,
        };
    }
}

TRANSACTION_REGISTRY.set(
    "cryptoDeleteLiveHash",
    // eslint-disable-next-line @typescript-eslint/unbound-method
    LiveHashDeleteTransaction._fromProtobuf
);
