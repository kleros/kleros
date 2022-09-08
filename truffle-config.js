require("dotenv").config();

module.exports = {
    compilers: {
        solc: {
            settings: {
                optimizer: {
                    enabled: true,
                    runs: 200,
                },
            },
            version: "0.4.26",
        },
    },
    coverage: {
        gas: 17592186044415,
        gasPrice: 0x01,
        host: "localhost",
        network_id: "*",
        port: 8555,
    },
    networks: {
        test: {
            gas: 8000000,
            host: "localhost",
            network_id: "*",
            port: 8545,
        },
    },
    api_keys: {
        etherscan: process.env.MY_API_KEY,
    },
    plugins: ["truffle-plugin-verify"],
};
