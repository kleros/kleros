const MetaCoin = artifacts.require('./MetaCoin.sol')

contract('MetaCoin', accounts => {

  // Get initial balances of first and second account.
  let accountOne = accounts[0]
  let accountTwo = accounts[1]

  it('should put 10000 MetaCoin in the first account', async () => {
    const instance = await MetaCoin.deployed()

    let balance = await instance.getBalance.call(accountOne)

    assert.equal(balance.valueOf(), 10000, '10000 wasn\'t in the first account')
  })

  it('should call a function that depends on a linked library', async () => {
    const instance = await MetaCoin.deployed()

    let balance = await instance.getBalance.call(accountOne)

    let metaCoinBalance = balance.toNumber()

    let balanceEth = await instance.getBalanceInEth.call(accountOne)

    let metaCoinBalanceEth = balanceEth.toNumber()

    assert.equal(metaCoinBalanceEth, 2 * metaCoinBalance, 'Library function returned unexpected function, linkage may be broken')
  })

  it('should send coin correctly', async () => {

    let amount = 10

    const instance = await MetaCoin.deployed()

    let balanceAccountOne = await instance.getBalance.call(accountOne)
    let balanceAccountTwo = await instance.getBalance.call(accountTwo)

    const accountOneStartingBalance = balanceAccountOne.toNumber()
    const accountTwoStartingBalance = balanceAccountTwo.toNumber()

    let sendCoin = await instance.sendCoin(accountTwo, amount, {from: accountOne})

    if (sendCoin) {
      balanceAccountOne = await instance.getBalance.call(accountOne)
      balanceAccountTwo = await instance.getBalance.call(accountTwo)

      const accountOneEndingBalance = balanceAccountOne.toNumber()
      const accountTwoEndingBalance = balanceAccountTwo.toNumber()

      assert.equal(accountOneEndingBalance, accountOneStartingBalance - amount, 'Amount wasn\'t correctly taken from the sender')
      assert.equal(accountTwoEndingBalance, accountTwoStartingBalance + amount, 'Amount wasn\'t correctly sent to the receiver')
    }
  })
})
