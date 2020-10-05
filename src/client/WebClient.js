import Client from "./Client";
import WebChannel from "../channel/WebChannel";
import AccountId from "../account/AccountId";

/**
 * @typedef {import("./Client").ClientConfiguration} ClientConfiguration
 */

export const Network = {
    MAINNET: {
        "https://grpc-web.myhbarwallet.com": new AccountId(3),
    },

    TESTNET: {
        "https://grpc-web.testnet.myhbarwallet.com": new AccountId(3),
    },

    PREVIEWNET: {
        "https://grpc-web.previewnet.myhbarwallet.com": new AccountId(3),
    },
};

/**
 * @augments {Client<WebChannel, void>}
 */
export default class WebClient extends Client {
    /**
     * @param {ClientConfiguration} [props]
     */
    constructor(props) {
        super(props);

        if (props != null) {
            if (typeof props.network === "string") {
                switch (props.network) {
                    case "mainnet":
                        this.setNetwork(Network.MAINNET);
                        break;

                    case "testnet":
                        this.setNetwork(Network.TESTNET);
                        break;

                    case "previewnet":
                        this.setNetwork(Network.PREVIEWNET);
                        break;

                    default:
                        throw new Error(
                            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                            `unknown network: ${props.network}`
                        );
                }
            } else if (props.network != null) {
                this.setNetwork(props.network);
            }
        }
    }

    /**
     * @param {string | ClientConfiguration} data
     * @returns {WebClient}
     */
    static fromConfig(data) {
        return new WebClient(
            typeof data === "string" ? JSON.parse(data) : data
        );
    }

    /**
     * Construct a client for a specific network.
     *
     * It is the responsibility of the caller to ensure that all nodes in the map are part of the
     * same Hedera network. Failure to do so will result in undefined behavior.
     *
     * The client will load balance all requests to Hedera using a simple round-robin scheme to
     * chose nodes to send transactions to. For one transaction, at most 1/3 of the nodes will be
     * tried.
     *
     * @param {{[key: string]: (string | AccountId)} | import("./Client").NetworkName} network
     * @returns {WebClient}
     */
    static forNetwork(network) {
        return new WebClient({ network });
    }

    /**
     * Construct a Hedera client pre-configured for Mainnet access.
     *
     * @returns {WebClient}
     */
    static forMainnet() {
        return new WebClient({ network: "mainnet" });
    }

    /**
     * Construct a Hedera client pre-configured for Testnet access.
     *
     * @returns {WebClient}
     */
    static forTestnet() {
        return new WebClient({ network: "testnet" });
    }

    /**
     * Construct a Hedera client pre-configured for Previewnet access.
     *
     * @returns {WebClient}
     */
    static forPreviewnet() {
        return new WebClient({ network: "previewnet" });
    }

    /**
     * @override
     * @param {string} address
     * @returns {WebChannel}
     */
    _createNetworkChannel(address) {
        return new WebChannel(address);
    }
}
