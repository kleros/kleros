/* globals artifacts, contract, expect, web3 */
const { soliditySha3 } = require('web3-utils')
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
const KlerosLiquid = artifacts.require('./kleros/KlerosLiquid.sol')

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
    hiddenVotes: ID % 2 === 0,
    minStake: newMinStake,
    alpha: randomInt(1000),
    jurorFee: randomInt(100),
    jurorsForJump: randomInt(15, 3),
    timesPerPeriod: [...new Array(4)].map(_ => randomInt(5)),
    sortitionSumTreeK: randomInt(2, 5),
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
        : undefined
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
  return { subcourtTree, subcourtMap }
}
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
const asyncForEach = async (method, iterable) => {
  const array = Array.isArray(iterable) ? iterable : Object.values(iterable)
  for (const item of array) await method(item)
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
    const { subcourtTree, subcourtMap } = generateSubcourts(randomInt(4, 2), 3)
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

    // Create subcourts and check hierarchy
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
    await asyncForEach(
      async subcourt =>
        expect(await klerosLiquid.courts(subcourt.ID)).to.deep.equal([
          web3.toBigNumber(subcourt.parent),
          subcourt.hiddenVotes,
          web3.toBigNumber(subcourt.minStake),
          web3.toBigNumber(subcourt.alpha),
          web3.toBigNumber(subcourt.jurorFee),
          web3.toBigNumber(subcourt.jurorsForJump)
        ]),
      subcourtMap
    )

    // Test moving a subcourt
    const subcourtToMove = subcourtTree.children[0].children[0].ID
    const subcourtToMoveMinStake = subcourtMap[subcourtToMove].minStake
    const parent = 1
    const nextParent = 2

    // Move subcourt and check hierarchy
    subcourtMap[subcourtToMove].minStake = 100
    await klerosLiquid.changeSubcourtMinStake(subcourtToMove, 100)
    subcourtMap[subcourtToMove].parent = nextParent
    await klerosLiquid.moveSubcourt(subcourtToMove, nextParent)
    await asyncForEach(
      async subcourt =>
        expect(await klerosLiquid.courts(subcourt.ID)).to.deep.equal([
          web3.toBigNumber(subcourt.parent),
          subcourt.hiddenVotes,
          web3.toBigNumber(subcourt.minStake),
          web3.toBigNumber(subcourt.alpha),
          web3.toBigNumber(subcourt.jurorFee),
          web3.toBigNumber(subcourt.jurorsForJump)
        ]),
      subcourtMap
    )

    // Move it back and check hierarchy
    subcourtMap[subcourtToMove].minStake = subcourtToMoveMinStake
    await klerosLiquid.changeSubcourtMinStake(
      subcourtToMove,
      subcourtToMoveMinStake
    )
    subcourtMap[subcourtToMove].parent = parent
    await klerosLiquid.moveSubcourt(subcourtToMove, parent)
    await asyncForEach(
      async subcourt =>
        expect(await klerosLiquid.courts(subcourt.ID)).to.deep.equal([
          web3.toBigNumber(subcourt.parent),
          subcourt.hiddenVotes,
          web3.toBigNumber(subcourt.minStake),
          web3.toBigNumber(subcourt.alpha),
          web3.toBigNumber(subcourt.jurorFee),
          web3.toBigNumber(subcourt.jurorsForJump)
        ]),
      subcourtMap
    )

    // Test subcourt governance
    await checkOnlyByGovernor(
      async () => (await klerosLiquid.courts(0))[1],
      subcourtTree.hiddenVotes,
      (nextValue, ...args) =>
        klerosLiquid.changeSubcourtHiddenVotes(0, nextValue, ...args),
      true,
      accounts[2]
    )
    await checkOnlyByGovernor(
      async () => (await klerosLiquid.courts(0))[2],
      subcourtTree.minStake,
      (nextValue, ...args) =>
        klerosLiquid.changeSubcourtMinStake(0, nextValue, ...args),
      0,
      accounts[2]
    )
    await checkOnlyByGovernor(
      async () => (await klerosLiquid.courts(0))[3],
      subcourtTree.alpha,
      (nextValue, ...args) =>
        klerosLiquid.changeSubcourtAlpha(0, nextValue, ...args),
      0,
      accounts[2]
    )
    await checkOnlyByGovernor(
      async () => (await klerosLiquid.courts(0))[4],
      subcourtTree.jurorFee,
      (nextValue, ...args) =>
        klerosLiquid.changeSubcourtJurorFee(0, nextValue, ...args),
      0,
      accounts[2]
    )
    await checkOnlyByGovernor(
      async () => (await klerosLiquid.courts(0))[5],
      subcourtTree.jurorsForJump,
      (nextValue, ...args) =>
        klerosLiquid.changeSubcourtJurorsForJump(0, nextValue, ...args),
      0,
      accounts[2]
    )
    await klerosLiquid.changeSubcourtTimesPerPeriod(
      0,
      subcourtTree.timesPerPeriod
    )

    // Test the dispute resolution flow
    const disputes = [
      {
        ID: 0,
        subcourtID: subcourtTree.children[0].children[0].ID,
        voteRatios: [0, 1, 2],
        appeals: 0
      },
      {
        ID: 1,
        subcourtID: subcourtTree.children[0].children[1].ID,
        voteRatios: [0, 2, 1],
        appeals: 1
      },
      {
        ID: 2,
        subcourtID: subcourtTree.children[1].children[0].ID,
        voteRatios: [1, 1, 2],
        appeals: 2
      },
      {
        ID: 3,
        subcourtID: subcourtTree.children[1].children[1].ID,
        voteRatios: [1, 2, 1],
        appeals: 2
      }
    ]

    // Create the disputes and set stakes
    await pinakion.generateTokens(governor, -1)
    for (const dispute of disputes) {
      const extraData = `0x${dispute.subcourtID.toString(16).padStart(64, '0')}`
      await klerosLiquid.createDispute(2, extraData, {
        value: await klerosLiquid.arbitrationCost(extraData)
      })
      await klerosLiquid.setStake(
        dispute.subcourtID,
        subcourtMap[dispute.subcourtID].minStake
      )
    }

    // Resolve disputes
    for (const dispute of disputes) {
      const numberOfDraws = []
      const totalJurorFees = []
      const voteRatioDivisor = dispute.voteRatios.reduce((acc, v) => acc + v, 0)
      for (let i = 0; i <= dispute.appeals; i++) {
        const subcourt = subcourtMap[dispute.subcourtID] || subcourtTree

        // Generate random number
        await increaseTime(minStakingTime)
        await klerosLiquid.passPhase()
        await klerosLiquid.passPhase()

        // Draw
        const drawBlockNumber = (await klerosLiquid.drawVotes(dispute.ID, -1))
          .receipt.blockNumber
        numberOfDraws.push(
          (await new Promise((resolve, reject) =>
            klerosLiquid
              .Draw({ _disputeID: dispute.ID }, { fromBlock: drawBlockNumber })
              .get((err, logs) => (err ? reject(err) : resolve(logs)))
          )).length
        )
        totalJurorFees.push(subcourt.jurorFee * numberOfDraws[i])
        await increaseTime(subcourt.timesPerPeriod[0])
        await klerosLiquid.passPeriod(dispute.ID)

        // Decide votes
        let votes = dispute.voteRatios
          .map((voteRatio, index) =>
            [
              ...new Array(
                Math.floor(numberOfDraws[i] * (voteRatio / voteRatioDivisor))
              )
            ].map(_ => index)
          )
          .reduce((acc, a) => [...acc, ...a], [])
        if (votes.length < numberOfDraws[i])
          votes = [
            ...votes,
            ...[...new Array(numberOfDraws[i] - votes.length)].map(_ => 0)
          ]

        // Commit
        if (subcourt.hiddenVotes) {
          for (let i = 0; i < votes.length; i++)
            await klerosLiquid.commit(
              dispute.ID,
              [i],
              [soliditySha3(votes[i], i)]
            )
          await increaseTime(subcourt.timesPerPeriod[1])
          await klerosLiquid.passPeriod(dispute.ID)
        }

        // Vote
        for (let i = 0; i < votes.length; i++)
          await klerosLiquid.vote(dispute.ID, [i], votes[i], [i])
        await increaseTime(subcourt.timesPerPeriod[2])
        await klerosLiquid.passPeriod(dispute.ID)

        // Appeal or execute
        if (i < dispute.appeals) {
          await klerosLiquid.appeal(
            dispute.ID,
            '0x0000000000000000000000000000000000000000',
            {
              value: await klerosLiquid.appealCost(
                dispute.ID,
                '0x0000000000000000000000000000000000000000'
              )
            }
          )
          dispute.subcourtID = (await klerosLiquid.disputes(
            dispute.ID
          ))[0].toNumber()
        } else {
          await increaseTime(subcourt.timesPerPeriod[3])
          await klerosLiquid.passPeriod(dispute.ID)
          for (let i = 0; i <= dispute.appeals; i++) {
            const PNKBefore = await pinakion.balanceOf(governor)
            const executeBlockNumber = (await klerosLiquid.execute(
              dispute.ID,
              i,
              -1
            )).receipt.blockNumber
            expect(PNKBefore).to.deep.equal(await pinakion.balanceOf(governor))
            expect(
              (await new Promise((resolve, reject) =>
                klerosLiquid
                  .TokenAndETHShift(
                    { _disputeID: dispute.ID },
                    { fromBlock: executeBlockNumber }
                  )
                  .get((err, logs) => (err ? reject(err) : resolve(logs)))
              ))
                .reduce(
                  (acc, e) => acc.plus(e.args._ETHAmount),
                  web3.toBigNumber(0)
                )
                .toNumber()
            ).to.be.closeTo(totalJurorFees[i], numberOfDraws[i])
          }
        }

        // Continue
        await klerosLiquid.passPhase()
      }
    }
  })
)
