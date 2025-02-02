import { elizaLogger, IAgentRuntime } from "@ai16z/eliza";
import { Account, Call, CallData, RpcProvider } from "starknet";

const VITE_PUBLIC_MASTER_ADDRESS =
    "0x3bed7e5d89967495c2bfdcbda5dc8ada87aea66a3289abe7bb0d3cdea2b720";
const VITE_PUBLIC_MASTER_PRIVATE_KEY =
    "0x4e641f2e3529225b4c584a4db19f999498292da5b785c0f2990926820cf4b71";
const VITE_PUBLIC_ACCOUNT_CLASS_HASH =
    "0x07dc7899aa655b0aae51eadff6d801a58e97dd99cf4666ee59e704249e51adf2";
const VITE_PUBLIC_TORII = "http://localhost:8080";
const VITE_PUBLIC_NODE_URL = "http://localhost:5050";
const VITE_PUBLIC_TORII_RELAY =
    "/dns4/api.cartridge.gg/tcp/443/x-parity-wss/%2Fx%2Feternum-rc-sepolia%2Ftorii%2Fwss";

interface GraphQLResponse<T> {
    data?: T;
    errors?: Array<{
        message: string;
        locations?: Array<{
            line: number;
            column: number;
        }>;
        path?: string[];
    }>;
}

async function queryGraphQL<T>(
    endpoint: string,
    query: string,
    variables?: Record<string, unknown>
): Promise<T | Error> {
    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                query,
                variables,
            }),
        });

        const result = (await response.json()) as GraphQLResponse<T>;

        if (result.errors) {
            return new Error(result.errors[0].message);
        }

        if (!result.data) {
            return new Error("No data returned from GraphQL query");
        }

        return result.data;
    } catch (error) {
        elizaLogger.error("GraphQL query failed:", error);
        return error instanceof Error
            ? error
            : new Error("Unknown error occurred");
    }
}

export const fetchData = async (
    query: string,
    variables: Record<string, unknown>
) => {
    return await queryGraphQL<string>(VITE_PUBLIC_TORII + "/graphql", query, {
        variables,
    });
};

// export const dojoConfig = createDojoConfig({
//     rpcUrl: VITE_PUBLIC_NODE_URL,
//     toriiUrl: VITE_PUBLIC_TORII,
//     relayUrl: VITE_PUBLIC_TORII_RELAY,
//     masterAddress: VITE_PUBLIC_MASTER_ADDRESS,
//     masterPrivateKey: VITE_PUBLIC_MASTER_PRIVATE_KEY,
//     accountClassHash:
//         VITE_PUBLIC_ACCOUNT_CLASS_HASH ||
//         "0x07dc7899aa655b0aae51eadff6d801a58e97dd99cf4666ee59e704249e51adf2",
//     feeTokenAddress: "0x0",
//     manifest: {
//         world: {
//             address:
//                 "0x5013b17c43a2b664ec2a38aa45f6d891db1188622ec7cf320411321c3248fb5",
//         },
//     },
// });

// export const eternumProvider = new DojoProvider(dojoConfig);

export const getStarknetProvider = (runtime: IAgentRuntime) => {
    return new RpcProvider({
        nodeUrl: runtime.getSetting("STARKNET_RPC_URL") || "",
    });
};

export const getStarknetAccount = (runtime: IAgentRuntime) => {
    return new Account(
        getStarknetProvider(runtime),
        runtime.getSetting("STARKNET_ADDRESS") || "",
        runtime.getSetting("STARKNET_PRIVATE_KEY") || ""
    );
};

export const callEternum = async (
    runtime: IAgentRuntime,
    call: Call
): Promise<any> => {
    try {
        console.log("Compiling call data:", call.calldata);

        call.calldata = CallData.compile(call.calldata || []);

        console.log("Calling Eternum:", call);

        const { transaction_hash } =
            await getStarknetAccount(runtime).execute(call);

        return await getStarknetAccount(runtime).waitForTransaction(
            transaction_hash,
            {
                retryInterval: 1000,
            }
        );
    } catch (error) {
        return error instanceof Error
            ? error
            : new Error("Unknown error occurred");
    }
};
