/* globals artifacts, contract, expect, web3 */
const {
  increaseTime
} = require('openzeppelin-solidity/test/helpers/increaseTime')

const Pinakion = artifacts.require(
  '@kleros/kleros-interaction/contracts/standard/arbitration/ArbitrableTokens/MiniMeTokenERC20.sol'
)
const ConstantNG = artifacts.require(
  '@kleros/kleros-interaction/contracts/standard/rng/ConstantNG.sol'
)
const KlerosLiquid = artifacts.require('./kleros/KlerosLiquid.sol')
const KlerosLiquidExtraViews = artifacts.require(
  './kleros/KlerosLiquidExtraViews.sol'
)

// Helpers
const randomInt = (max, min = 1) =>
  Math.max(min, Math.ceil(Math.random() * max))
const generateSubcourts = (
  K,
  depth,
  ID = 0,
  minStake = 0,
  subcourtMap = {}
) => {
  const newMinStake = Math.max(randomInt(100), minStake)
  const subcourtTree = {
    ID,
    alpha: randomInt(1000),
    children:
      depth > 1
        ? [...new Array(K)].map(
            (_, i) =>
              generateSubcourts(
                K,
                depth - 1,
                K * ID + i + 1,
                newMinStake,
                subcourtMap
              ).subcourtTree
          )
        : undefined,
    hiddenVotes: ID % 2 === 0,
    jurorFee: randomInt(100),
    jurorsForJump: randomInt(15, 3),
    minStake: newMinStake,
    sortitionSumTreeK: randomInt(2, 5),
    timesPerPeriod: [...new Array(4)].map(_ => randomInt(5))
  }
  if (ID === 0) subcourtTree.parent = 0
  else {
    subcourtTree.parent = Math.floor((ID - 1) / K)
    subcourtMap[subcourtTree.ID] = {
      ...subcourtTree,
      children:
        subcourtTree.children && subcourtTree.children.map(child => child.ID)
    }
  }
  return { subcourtMap, subcourtTree }
}
const asyncForEach = async (method, iterable) => {
  const array = Array.isArray(iterable) ? iterable : Object.values(iterable)
  for (const item of array) await method(item)
}

contract('xKlerosLiquid', accounts => {
  let pinakion
  let RNG
  let governor
  let minStakingTime
  let maxDrawingTime
  let subcourtTree
  let subcourtMap
  let klerosLiquid
  let extraViews
  beforeEach(async () => {
    governor = accounts[0]
    // Deploy contracts and generate subcourts
    pinakion = await Pinakion.new(
      0x0, // _tokenFactory
      0x0, // _parentToken
      0, // _parentSnapShotBlock
      'Pinakion', // _tokenName
      18, // _decimalUnits
      'PNK', // _tokenSymbol
      true // _transfersEnabled
    )
    await pinakion.generateTokens(governor, -1)

    const randomNumber = 10
    RNG = await ConstantNG.new(randomNumber)
    minStakingTime = 1
    maxDrawingTime = 1
    const {
      subcourtMap: _subcourtMap,
      subcourtTree: _subcourtTree
    } = generateSubcourts(randomInt(4, 2), 3)
    subcourtTree = _subcourtTree
    subcourtMap = _subcourtMap

    klerosLiquid = await KlerosLiquid.new(
      governor,
      pinakion.address,
      RNG.address,
      minStakingTime,
      maxDrawingTime,
      subcourtTree.hiddenVotes,
      subcourtTree.minStake,
      subcourtTree.alpha,
      subcourtTree.jurorFee,
      subcourtTree.jurorsForJump,
      subcourtTree.timesPerPeriod,
      subcourtTree.sortitionSumTreeK
    )

    await pinakion.changeController(klerosLiquid.address)
    extraViews = await KlerosLiquidExtraViews.new(klerosLiquid.address)
  })

  it('Should query delayed stakes correctly.', async () => {
    await klerosLiquid.createSubcourt(
      subcourtTree.parent,
      subcourtTree.hiddenVotes,
      subcourtTree.minStake + 1,
      subcourtTree.alpha,
      subcourtTree.jurorFee,
      subcourtTree.jurorsForJump,
      subcourtTree.timesPerPeriod,
      subcourtTree.sortitionSumTreeK
    )

    const extraData = `0x${(0).toString(16).padStart(64, '0')}${(1)
      .toString(16)
      .padStart(64, '0')}`
    await klerosLiquid.createDispute(2, extraData, {
      value: await klerosLiquid.arbitrationCost(extraData)
    })
    await increaseTime(minStakingTime)
    await klerosLiquid.passPhase()

    await klerosLiquid.setStake(0, subcourtTree.minStake, {
      from: governor
    })
    await klerosLiquid.setStake(1, subcourtTree.minStake + 1, {
      from: governor
    })

    const stake0 = await extraViews.stakeOf(governor, 0)
    const stake1 = await extraViews.stakeOf(governor, 1)
    expect(stake0).to.eql(web3.toBigNumber(subcourtTree.minStake))
    expect(stake1).to.eql(web3.toBigNumber(subcourtTree.minStake + 1))

    const jurorData = await extraViews.getJuror(governor)
    expect(jurorData[0]).to.deep.equal([
      web3.toBigNumber(1),
      web3.toBigNumber(2),
      web3.toBigNumber(0),
      web3.toBigNumber(0)
    ])
    expect(jurorData[1]).to.eql(web3.toBigNumber(subcourtTree.minStake * 2 + 1))
    expect(jurorData[2]).to.eql(web3.toBigNumber(0))
    expect(jurorData[3]).to.deep.equal([
      stake0,
      stake1,
      web3.toBigNumber(0),
      web3.toBigNumber(0)
    ])
  })

  it('Should ignore invalid delayed stakes.', async () => {
    await asyncForEach(
      subcourt =>
        klerosLiquid.createSubcourt(
          subcourt.parent,
          subcourt.hiddenVotes,
          subcourt.minStake,
          subcourt.alpha,
          subcourt.jurorFee,
          subcourt.jurorsForJump,
          subcourt.timesPerPeriod,
          subcourt.sortitionSumTreeK
        ),
      subcourtMap
    )

    // Pass phase.
    const extraData = `0x${(0).toString(16).padStart(64, '0')}${(1)
      .toString(16)
      .padStart(64, '0')}`
    await klerosLiquid.createDispute(2, extraData, {
      value: await klerosLiquid.arbitrationCost(extraData)
    })
    await increaseTime(minStakingTime)
    await klerosLiquid.passPhase()

    // Stake not high enough.
    await klerosLiquid.setStake(subcourtTree.ID, subcourtTree.minStake - 1)
    const stake0 = await extraViews.stakeOf(governor, subcourtTree.ID)
    expect(stake0).to.eql(web3.toBigNumber(0))

    // Can only stake in 4 paths.
    await klerosLiquid.setStake(subcourtTree.ID, subcourtTree.minStake)
    await klerosLiquid.setStake(
      subcourtTree.children[0].ID,
      subcourtTree.children[0].minStake
    )
    await klerosLiquid.setStake(
      subcourtTree.children[1].ID,
      subcourtTree.children[1].minStake
    )
    await klerosLiquid.setStake(
      subcourtTree.children[0].children[0].ID,
      subcourtTree.children[0].children[0].minStake
    )
    await klerosLiquid.setStake(
      subcourtTree.children[0].children[1].ID,
      subcourtTree.children[0].children[1].minStake
    )

    let totalStaked =
      subcourtTree.minStake +
      subcourtTree.children[0].minStake +
      subcourtTree.children[1].minStake +
      subcourtTree.children[0].children[0].minStake

    let jurorData = await extraViews.getJuror(governor)
    expect(jurorData[0]).to.deep.equal([
      web3.toBigNumber(subcourtTree.ID + 1),
      web3.toBigNumber(subcourtTree.children[0].ID + 1),
      web3.toBigNumber(subcourtTree.children[1].ID + 1),
      web3.toBigNumber(subcourtTree.children[0].children[0].ID + 1)
    ])
    expect(jurorData[1]).to.eql(web3.toBigNumber(totalStaked))
    expect(jurorData[2]).to.eql(web3.toBigNumber(0))
    expect(jurorData[3]).to.deep.equal([
      web3.toBigNumber(subcourtTree.minStake),
      web3.toBigNumber(subcourtTree.children[0].minStake),
      web3.toBigNumber(subcourtTree.children[1].minStake),
      web3.toBigNumber(subcourtTree.children[0].children[0].minStake)
    ])

    // Unstake
    await klerosLiquid.setStake(subcourtTree.children[0].ID, 0)
    totalStaked -= subcourtTree.children[0].minStake
    jurorData = await extraViews.getJuror(governor)
    expect(jurorData[0]).to.deep.equal([
      web3.toBigNumber(subcourtTree.ID + 1),
      web3.toBigNumber(0),
      web3.toBigNumber(subcourtTree.children[1].ID + 1),
      web3.toBigNumber(subcourtTree.children[0].children[0].ID + 1)
    ])
    expect(jurorData[1]).to.eql(web3.toBigNumber(totalStaked))
    expect(jurorData[2]).to.eql(web3.toBigNumber(0))
    expect(jurorData[3]).to.deep.equal([
      web3.toBigNumber(subcourtTree.minStake),
      web3.toBigNumber(0),
      web3.toBigNumber(subcourtTree.children[1].minStake),
      web3.toBigNumber(subcourtTree.children[0].children[0].minStake)
    ])
  })
})
