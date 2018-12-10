/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.

const {
  expectThrow
} = require('openzeppelin-solidity/test/helpers/expectThrow')
const {
  increaseTime
} = require('openzeppelin-solidity/test/helpers/increaseTime')

const Pinakion = artifacts.require(
  'kleros-interaction/contracts/standard/arbitration/ArbitrableTokens/MiniMeTokenERC20.sol'
)
const ConstantNG = artifacts.require(
  'kleros-interaction/contracts/standard/rng/ConstantNG.sol'
)
const Kleros = artifacts.require('./kleros/Kleros.sol')
const Briber = artifacts.require('./kleros/Briber.sol')

contract('Briber', function(accounts) {
  const timePeriod = 60
  const randomNumber = 10
  const minActivationToken = 1
  const governor = accounts[0]
  const juror = accounts[1]
  const timePeriods = [
    timePeriod,
    timePeriod,
    timePeriod,
    timePeriod,
    timePeriod
  ]
  const bribe = 2000000
  const target = 1
  const differentTarget = 2
  const disputeID = 0
  const choices = 2
  const extraData = 0x0

  it('Should pay correct amount in case of a dispute with no appeals', async () => {
    const RNG = await ConstantNG.new(randomNumber)
    const pinakion = await Pinakion.new(
      0x0, // _tokenFactory
      0x0, // _parentToken
      0, // _parentSnapShotBlock
      'Pinakion', // _tokenName
      18, // _decimalUnits
      'PNK', // _tokenSymbol
      true // _transfersEnabled
    )

    const kleros = await Kleros.new(
      pinakion.address,
      RNG.address,
      timePeriods,
      governor
    )
    const briber = await Briber.new(kleros.address, disputeID, bribe, target)

    await pinakion.generateTokens(governor, -1)
    await pinakion.transfer(juror, 5000)
    await pinakion.approveAndCall(kleros.address, 5000, 0x0, { from: juror })
    await kleros.createDispute(choices, extraData, {
      value: await kleros.arbitrationCost(extraData)
    })

    await kleros.setDefaultNumberJuror(1)
    await kleros.setMinActivatedToken(minActivationToken)

    // activation period
    await kleros.activateTokens(1000, { from: juror })
    await increaseTime(timePeriod)
    await kleros.passPeriod()
    // draw
    await increaseTime(timePeriod)
    await kleros.passPeriod()
    // voting
    await kleros.voteRuling(disputeID, target, [1], { from: juror })
    await increaseTime(timePeriod)
    await kleros.passPeriod()
    // appeal
    // shouldn't be able to bribe in an unsolved dispute
    await expectThrow(briber.settle())
    await increaseTime(timePeriod)
    await kleros.passPeriod()
    // dispute is solved now
    // sending to the contract some eth so it'll be able to pay the bribe
    await briber.send(bribe * 5)
    const balanceBeforeBribe = await web3.eth.getBalance(juror)
    await briber.settle()
    const balanceAfterBribe = await web3.eth.getBalance(juror)
    assert.equal(
      balanceBeforeBribe.toNumber() + bribe,
      balanceAfterBribe.toNumber(),
      'The juror has not been paid correctly'
    )
  })

  it('Should pay correct amount in case of an appealed dispute', async () => {
    const RNG = await ConstantNG.new(randomNumber)
    const pinakion = await Pinakion.new(
      0x0, // _tokenFactory
      0x0, // _parentToken
      0, // _parentSnapShotBlock
      'Pinakion', // _tokenName
      18, // _decimalUnits
      'PNK', // _tokenSymbol
      true // _transfersEnabled
    )

    const kleros = await Kleros.new(
      pinakion.address,
      RNG.address,
      timePeriods,
      governor
    )
    const briber = await Briber.new(kleros.address, disputeID, bribe, target)

    await pinakion.generateTokens(governor, -1)
    await pinakion.transfer(juror, 5000)
    await pinakion.approveAndCall(kleros.address, 5000, 0x0, { from: juror })
    await kleros.createDispute(choices, extraData, {
      value: await kleros.arbitrationCost(extraData)
    })

    await kleros.setDefaultNumberJuror(1)
    await kleros.setMinActivatedToken(minActivationToken)

    // activation period
    await kleros.activateTokens(1000, { from: juror })
    await increaseTime(timePeriod)
    await kleros.passPeriod()
    // draw
    await increaseTime(timePeriod)
    await kleros.passPeriod()
    // voting
    await kleros.voteRuling(disputeID, target, [1], { from: juror })
    await increaseTime(timePeriod)
    await kleros.passPeriod()
    // appeal
    await kleros.appeal(0, extraData, {
      value: await kleros.appealCost(0, extraData)
    })

    await increaseTime(timePeriod)
    await kleros.passPeriod()
    // execution
    await increaseTime(timePeriod)
    await kleros.passPeriod()

    // 2nd session of voting because of appeal
    // activation period
    await kleros.activateTokens(1000, { from: juror })
    await increaseTime(timePeriod)
    await kleros.passPeriod()
    // draw
    await increaseTime(timePeriod)
    await kleros.passPeriod()
    // voting
    await kleros.voteRuling(disputeID, target, [1], { from: juror })
    await increaseTime(timePeriod)
    await kleros.passPeriod()
    // appeal
    // shouldn't be able to bribe in an unsolved dispute
    await expectThrow(briber.settle())
    await increaseTime(timePeriod)
    await kleros.passPeriod()
    // dispute is solved now
    // sending to the contract some eth so it'll be able to pay the bribe
    await briber.send(bribe * 5)
    const balanceBeforeBribe = await web3.eth.getBalance(juror)
    await briber.settle()
    const balanceAfterBribe = await web3.eth.getBalance(juror)
    assert.equal(
      balanceBeforeBribe.toNumber() + bribe * 2,
      balanceAfterBribe.toNumber(),
      'The juror has not been paid correctly'
    )
  })

  it('Shouldnt pay if the juror votes for a different target', async () => {
    const RNG = await ConstantNG.new(randomNumber)
    const pinakion = await Pinakion.new(
      0x0, // _tokenFactory
      0x0, // _parentToken
      0, // _parentSnapShotBlock
      'Pinakion', // _tokenName
      18, // _decimalUnits
      'PNK', // _tokenSymbol
      true // _transfersEnabled
    )

    const kleros = await Kleros.new(
      pinakion.address,
      RNG.address,
      timePeriods,
      governor
    )
    const briber = await Briber.new(kleros.address, disputeID, bribe, target)

    await pinakion.generateTokens(governor, -1)
    await pinakion.transfer(juror, 5000)
    await pinakion.approveAndCall(kleros.address, 5000, 0x0, { from: juror })
    await kleros.createDispute(choices, extraData, {
      value: await kleros.arbitrationCost(extraData)
    })

    // shouldn't be able to bribe in an unsolved dispute
    await expectThrow(briber.settle())

    await kleros.setDefaultNumberJuror(1)
    await kleros.setMinActivatedToken(minActivationToken)

    // activation period
    await kleros.activateTokens(1000, { from: juror })
    await increaseTime(timePeriod)
    await kleros.passPeriod()
    // draw
    await increaseTime(timePeriod)
    await kleros.passPeriod()
    // voting
    await kleros.voteRuling(disputeID, differentTarget, [1], { from: juror })
    await increaseTime(timePeriod)
    await kleros.passPeriod()
    // appeal
    await increaseTime(timePeriod)
    await kleros.passPeriod()
    // dispute is solved now
    // sending to the contract some eth so it'll be able to pay the bribe
    await briber.send(bribe * 5)
    const balanceBeforeBribe = await web3.eth.getBalance(juror)
    await briber.settle()
    const balanceAfterBribe = await web3.eth.getBalance(juror)
    assert.equal(
      balanceBeforeBribe.toNumber(),
      balanceAfterBribe.toNumber(),
      'The juror balance should stay the same'
    )
  })
})
