module.exports = {
  compilers: {
    solc: {
      settings: {
        optimizer: {
          enabled: true,
          runs: 1
        }
      },
      version: '0.4.26'
    }
  },
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
  }
}
