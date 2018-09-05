/* globals artifacts, contract, expect, web3 */
const { expectThrow } = require('kleros-interaction/helpers/utils')

const Pinakion = artifacts.require(
  'kleros-interaction/contracts/standard/arbitration/ArbitrableTokens/MiniMeTokenERC20.sol'
)
const ConstantNG = artifacts.require(
  'kleros-interaction/contracts/standard/rng/ConstantNG.sol'
)
const KlerosLiquid = artifacts.require('./data-structures/KlerosLiquid.sol')

// Helpers
const randomInt = (max, min = 1) =>
  Math.max(min, Math.ceil(Math.random() * max))
const generateSubcourts = (K, depth, ID = 0) => ({
  ID,
  hiddenVotes: Math.random() < 0.5,
  minStake: randomInt(100),
  alpha: randomInt(1000),
  jurorFee: randomInt(100),
  minJurors: randomInt(5, 3),
  jurorsForJump: randomInt(15, 3),
  timesPerPeriod: [...new Array(4)].map(_ => randomInt(5)),
  sortitionSumTreeK: randomInt(5),
  children:
    depth > 1
      ? [...new Array(K)].map((_, i) =>
          generateSubcourts(K, depth - 1, K * ID + i)
        )
      : undefined
})
const checkOnlyByGovernor = async (
  getter,
  value,
  method,
  nextValue,
  invalidFrom,
  nextFrom
) => {
  await method(nextValue) // Set the next value
  expect(await getter()).to.deep.equal(
    nextValue === Number(nextValue) ? web3.toBigNumber(nextValue) : nextValue
  ) // Check it was set properly
  await expectThrow(method(value, { from: invalidFrom })) // Throw when setting from a non governor address
  await method(value, nextFrom && { from: nextFrom }) // Set back to the original value
}

contract('KlerosLiquid', accounts =>
  it('Should implement the spec, https://docs.google.com/document/d/17aqJ0LTLJrQNSk07Cwop4JVRmicaCLi1I4UfYeSw96Y.', async () => {
    // Deploy contracts and generate subcourts
    const pinakion = await Pinakion.new(
      0x0, // _tokenFactory
      0x0, // _parentToken
      0, // _parentSnapShotBlock
      'Pinakion', // _tokenName
      18, // _decimalUnits
      'PNK', // _tokenSymbol
      true // _transfersEnabled
    )
    const randomNumber = 10
    const RNG = await ConstantNG.new(randomNumber)
    const governor = accounts[0]
    const minStakingTime = 1
    const maxDrawingTime = 1
    const subcourtTree = generateSubcourts(2, 3)
    const klerosLiquid = await KlerosLiquid.new(
      governor,
      pinakion.address,
      RNG.address,
      minStakingTime,
      maxDrawingTime,
      subcourtTree.hiddenVotes,
      subcourtTree.minStake,
      subcourtTree.alpha,
      subcourtTree.jurorFee,
      subcourtTree.minJurors,
      subcourtTree.jurorsForJump,
      subcourtTree.timesPerPeriod,
      subcourtTree.sortitionSumTreeK
    )

    // Test general governance
    await checkOnlyByGovernor(
      klerosLiquid.governor,
      governor,
      klerosLiquid.changeGovernor,
      accounts[1],
      accounts[2],
      accounts[1]
    )
    await checkOnlyByGovernor(
      klerosLiquid.pinakion,
      pinakion.address,
      klerosLiquid.changePinakion,
      '0x0000000000000000000000000000000000000000',
      accounts[2]
    )
    await checkOnlyByGovernor(
      klerosLiquid.RNGenerator,
      RNG.address,
      klerosLiquid.changeRNGenerator,
      '0x0000000000000000000000000000000000000000',
      accounts[2]
    )
    await checkOnlyByGovernor(
      klerosLiquid.minStakingTime,
      minStakingTime,
      klerosLiquid.changeMinStakingTime,
      0,
      accounts[2]
    )
    await checkOnlyByGovernor(
      klerosLiquid.maxDrawingTime,
      maxDrawingTime,
      klerosLiquid.changeMaxDrawingTime,
      0,
      accounts[2]
    )
  })
)
