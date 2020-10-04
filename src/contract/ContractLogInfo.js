import ContractId from "./ContractId";
import * as proto from "@hashgraph/proto";

/**
 * The log information for an event returned by a smart contract function call. One function call
 * may return several such events.
 */
export default class ContractLogInfo {
    /**
     * @param {object} properties
     * @param {ContractId} properties.contractId
     * @param {Uint8Array} properties.bloom
     * @param {Uint8Array[]} properties.topics
     * @param {Uint8Array} properties.data
     */
    constructor(properties) {
        /**
         * Address of a contract that emitted the event.
         *
         * @readonly
         */
        this.contractId = properties.contractId;

        /**
         * Bloom filter for a particular log.
         *
         * @readonly
         */
        this.bloom = properties.bloom;

        /**
         * Topics of a particular event.
         *
         * @readonly
         */
        this.topics = properties.topics;

        /**
         * Event data.
         *
         * @readonly
         */
        this.data = properties.data;

        Object.freeze(this);
    }

    /**
     * @internal
     * @param {proto.IContractLoginfo} info
     * @returns {ContractLogInfo}
     */
    static _fromProtobuf(info) {
        return new ContractLogInfo({
            contractId: ContractId._fromProtobuf(
                /** @type {proto.IContractID} */ (info.contractID)
            ),
            bloom: info.bloom != null ? info.bloom : new Uint8Array(),
            topics: info.topic != null ? info.topic : [],
            data: info.data != null ? info.data : new Uint8Array(),
        });
    }

    /**
     * @internal
     * @returns {proto.IContractLoginfo}
     */
    _toProtobuf() {
        return {
            contractID: this.contractId._toProtobuf(),
            bloom: this.bloom,
            topic: this.topics,
            data: this.data,
        };
    }
}
