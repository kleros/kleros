module.exports = {
  solc: {
    optimizer: {
      enabled: true,
      runs: 1
    }
  },
  networks: {
    test: {
      host: 'localhost',
      port: 8545,
      network_id: '*',
      gas: 8000000
    },
    coverage: {
      host: 'localhost',
      port: 8555,
      network_id: '*',
      gas: 17592186044415,
      gasPrice: 0x01
    }
  }
}
