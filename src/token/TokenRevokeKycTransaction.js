import TokenId from "./TokenId.js";
import AccountId from "../account/AccountId.js";
import Transaction, {
    TRANSACTION_REGISTRY,
} from "../transaction/Transaction.js";

/**
 * @namespace proto
 * @typedef {import("@hashgraph/proto").ITransaction} proto.ITransaction
 * @typedef {import("@hashgraph/proto").TransactionBody} proto.TransactionBody
 * @typedef {import("@hashgraph/proto").ITransactionBody} proto.ITransactionBody
 * @typedef {import("@hashgraph/proto").ITransactionResponse} proto.ITransactionResponse
 * @typedef {import("@hashgraph/proto").ITokenRevokeKycTransactionBody} proto.ITokenRevokeKycTransactionBody
 * @typedef {import("@hashgraph/proto").ITokenID} proto.ITokenID
 */

/**
 * @typedef {import("../channel/Channel.js").default} Channel
 */

/**
 * RevokeKyc a new Hedera™ crypto-currency token.
 */
export default class TokenRevokeKycTransaction extends Transaction {
    /**
     * @param {object} [props]
     * @param {TokenId | string} [props.tokenId]
     * @param {AccountId | string} [props.accountId]
     */
    constructor(props = {}) {
        super();

        /**
         * @private
         * @type {?TokenId}
         */
        this._tokenId = null;

        /**
         * @private
         * @type {?AccountId}
         */
        this._accountId = null;

        if (props.tokenId != null) {
            this.setTokenId(props.tokenId);
        }

        if (props.accountId != null) {
            this.setAccountId(props.accountId);
        }
    }

    /**
     * @internal
     * @param {Map<string, Map<AccountId, proto.ITransaction>>} transactions
     * @param {proto.ITransactionBody} body
     * @returns {TokenRevokeKycTransaction}
     */
    static _fromProtobuf(transactions, body) {
        const revokeKycToken = /** @type {proto.ITokenRevokeKycTransactionBody} */ (body.tokenCreation);

        return Transaction._fromProtobufTransactions(
            new TokenRevokeKycTransaction({
                tokenId:
                    revokeKycToken.token != null
                        ? TokenId._fromProtobuf(revokeKycToken.token)
                        : undefined,
                accountId:
                    revokeKycToken.account != null
                        ? AccountId._fromProtobuf(revokeKycToken.account)
                        : undefined,
            }),
            transactions,
            body
        );
    }

    /**
     * @returns {?TokenId}
     */
    get tokenId() {
        return this._tokenId;
    }

    /**
     * @param {TokenId | string} tokenId
     * @returns {this}
     */
    setTokenId(tokenId) {
        this._requireNotFrozen();
        this._tokenId =
            tokenId instanceof TokenId ? tokenId : TokenId.fromString(tokenId);

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
     * @returns {this}
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
        return channel.token.revokeKycFromTokenAccount(request);
    }

    /**
     * @override
     * @protected
     * @returns {NonNullable<proto.TransactionBody["data"]>}
     */
    _getTransactionDataCase() {
        return "tokenRevokeKyc";
    }

    /**
     * @override
     * @protected
     * @returns {proto.ITokenRevokeKycTransactionBody}
     */
    _makeTransactionData() {
        return {
            token: this._tokenId != null ? this._tokenId._toProtobuf() : null,
            account:
                this._accountId != null ? this._accountId._toProtobuf() : null,
        };
    }
}

TRANSACTION_REGISTRY.set(
    "tokenRevokeKyc",
    // eslint-disable-next-line @typescript-eslint/unbound-method
    TokenRevokeKycTransaction._fromProtobuf
);
