module.exports = {
  coverage: {
    gas: 17592186044415,
    gasPrice: 0x01,
    host: 'localhost',
    network_id: '*',
    port: 8555
  },
  networks: {
    test: {
      gas: 8000000,
      host: 'localhost',
      network_id: '*',
      port: 8545
    }
  },
  solc: {
    optimizer: {
      enabled: true,
      runs: 1
    }
  }
}
