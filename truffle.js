module.exports = {
  solc: {
    optimizer: {
      enabled: true,
      runs: 200
    }
  },
  networks: {
    test: {
      host: 'localhost',
      port: 8545,
      network_id: '*',
      gas: 8000000
    }
  }
}
