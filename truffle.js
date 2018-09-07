module.exports = {
  // mocha: {
  //   reporter: 'eth-gas-reporter',
  //   reporterOptions: {
  //     currency: 'USD',
  //     gasPrice: 21
  //   }
  // },
  solc: {
    optimizer: {
      enabled: true,
      runs: 200
    }
  }
}
