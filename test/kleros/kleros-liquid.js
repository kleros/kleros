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

contract('KlerosLiquid', accounts => {
  let pinakion
  let randomNumber
  let RNG
  let governor
  let minStakingTime
  let maxDrawingTime
  let subcourtTree
  let subcourtMap
  let klerosLiquid
  beforeEach(async () => {
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
    randomNumber = 10
    RNG = await ConstantNG.new(randomNumber)
    governor = accounts[0]
    minStakingTime = 1
    maxDrawingTime = 1
    const {
      subcourtTree: _subcourtTree,
      subcourtMap: _subcourtMap
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
  })

  it('Should implement the spec, https://docs.google.com/document/d/17aqJ0LTLJrQNSk07Cwop4JVRmicaCLi1I4UfYeSw96Y.', async () => {
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

    // Test subcourt governance
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

    // Create the disputes and set stakes directly
    await pinakion.generateTokens(governor, -1)
    for (const dispute of disputes) {
      const extraData = `0x${dispute.subcourtID
        .toString(16)
        .padStart(64, '0')}${(1).toString(16).padStart(64, '0')}`
      await klerosLiquid.createDispute(2, extraData, {
        value: await klerosLiquid.arbitrationCost(extraData)
      })
      await klerosLiquid.setStake(
        dispute.subcourtID,
        subcourtMap[dispute.subcourtID].minStake
      )
    }

    // Set stakes using delayed actions
    await increaseTime(minStakingTime)
    await klerosLiquid.passPhase()
    await klerosLiquid.passPhase()
    for (const dispute of disputes)
      await klerosLiquid.setStake(
        dispute.subcourtID,
        subcourtMap[dispute.subcourtID].minStake
      )
    await increaseTime(maxDrawingTime)
    await klerosLiquid.passPhase()
    for (const _dispute of disputes)
      await klerosLiquid.executeDelayedSetStakes(1)

    // Resolve disputes
    for (const dispute of disputes) {
      const numberOfDraws = []
      const totalJurorFees = []
      const votes = []
      const voteRatioDivisor = dispute.voteRatios.reduce((acc, v) => acc + v, 0)
      for (let i = 0; i <= dispute.appeals; i++) {
        const subcourt = subcourtMap[dispute.subcourtID] || subcourtTree

        // Generate random number
        await increaseTime(minStakingTime)
        await klerosLiquid.passPhase()
        await klerosLiquid.passPhase()

        // Draw
        const stakedTokensBefore = (await klerosLiquid.jurors(governor))[1]
        const drawBlockNumber = (await klerosLiquid.drawJurors(dispute.ID, -1))
          .receipt.blockNumber
        numberOfDraws.push(
          // eslint-disable-next-line no-loop-func
          (await new Promise((resolve, reject) =>
            klerosLiquid
              .Draw({ _disputeID: dispute.ID }, { fromBlock: drawBlockNumber })
              .get((err, logs) => (err ? reject(err) : resolve(logs)))
          )).length
        )
        totalJurorFees.push(subcourt.jurorFee * numberOfDraws[i])
        expect((await klerosLiquid.jurors(governor))[1]).to.deep.equal(
          stakedTokensBefore.plus(
            web3
              .toBigNumber(subcourt.minStake)
              .times(subcourt.alpha)
              .divToInt(10000)
              .times(numberOfDraws[i])
          )
        )
        await increaseTime(subcourt.timesPerPeriod[0])
        await klerosLiquid.passPeriod(dispute.ID)

        // Decide votes
        votes.push(
          dispute.voteRatios
            .map((voteRatio, index) =>
              [
                ...new Array(
                  Math.floor(numberOfDraws[i] * (voteRatio / voteRatioDivisor))
                )
              ].map(_ => index)
            )
            .reduce((acc, a) => [...acc, ...a], [])
        )
        if (votes[i].length < numberOfDraws[i])
          votes[i] = [
            ...votes[i],
            ...[...new Array(numberOfDraws[i] - votes[i].length)].map(_ => 0)
          ]

        // Commit
        if (subcourt.hiddenVotes) {
          for (let j = 0; j < votes[i].length; j++)
            await klerosLiquid.commit(
              dispute.ID,
              [j],
              soliditySha3(votes[i][j], j)
            )
          await increaseTime(subcourt.timesPerPeriod[1])
          await klerosLiquid.passPeriod(dispute.ID)
        }

        // Vote
        for (let j = 0; j < votes[i].length; j++)
          await klerosLiquid.vote(dispute.ID, [j], votes[i][j], j)
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
            const voteCounters = Object.entries(
              votes[votes.length - 1].reduce((acc, v) => {
                acc[v] = (acc[v] || 0) + 1
                return acc
              }, {})
            ).sort((a, b) => b[1] - a[1])
            const notTieAndNoCoherent =
              !(voteCounters[1] && voteCounters[1][1] === voteCounters[0][1]) &&
              !votes[i].includes(Number(voteCounters[0][0]))
            const PNKBefore = await pinakion.balanceOf(governor)
            const executeBlockNumber = (await klerosLiquid.execute(
              dispute.ID,
              i,
              -1
            )).receipt.blockNumber
            expect(PNKBefore).to.deep.equal(await pinakion.balanceOf(governor))
            expect(
              // eslint-disable-next-line no-loop-func
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
            ).to.be.closeTo(
              notTieAndNoCoherent ? 0 : totalJurorFees[i],
              numberOfDraws[i]
            )
          }
          expect((await klerosLiquid.jurors(governor))[1]).to.deep.equal(
            web3.toBigNumber(0)
          )
        }

        // Continue
        await klerosLiquid.passPhase()
      }
    }
  })

  it('Should execute governor proposals.', async () => {
    const transferAmount = 100
    const PNKBefore = await pinakion.balanceOf(klerosLiquid.address)
    await pinakion.generateTokens(klerosLiquid.address, transferAmount)
    await expectThrow(
      klerosLiquid.executeGovernorProposal(
        pinakion.address,
        transferAmount,
        pinakion.contract.transfer.getData(governor, transferAmount)
      )
    )
    await klerosLiquid.executeGovernorProposal(
      pinakion.address,
      0,
      pinakion.contract.transfer.getData(governor, transferAmount)
    )
    expect(PNKBefore).to.deep.equal(
      await pinakion.balanceOf(klerosLiquid.address)
    )
  })

  it('Should bump `RNBlock` when changing the `RNGenerator` during the generating phase.', async () => {
    const extraData = `0x${(0).toString(16).padStart(64, '0')}${(1)
      .toString(16)
      .padStart(64, '0')}`
    await klerosLiquid.createDispute(2, extraData, {
      value: await klerosLiquid.arbitrationCost(extraData)
    })
    let phase = Number(await klerosLiquid.phase())
    while (phase !== 1) {
      switch (phase) {
        case 0:
          await increaseTime(minStakingTime)
          break
        case 2:
          await increaseTime(maxDrawingTime)
          break
        default:
          break
      }
      await klerosLiquid.passPhase()
      phase = (phase + 1) % 3
    }
    const RNBlock = await klerosLiquid.RNBlock()
    await klerosLiquid.changeRNGenerator(RNG.address)
    expect(RNBlock.plus(1)).to.deep.equal(await klerosLiquid.RNBlock())
  })

  it('Should not allow creating subcourts with parents that have a higher minimum stake.', () =>
    expectThrow(
      klerosLiquid.createSubcourt(
        subcourtTree.parent,
        subcourtTree.hiddenVotes,
        subcourtTree.minStake - 1,
        subcourtTree.alpha,
        subcourtTree.jurorFee,
        subcourtTree.jurorsForJump,
        subcourtTree.timesPerPeriod,
        subcourtTree.sortitionSumTreeK
      )
    ))

  it("Should not allow changing a subcourt's minimum stake to a value lower than its parent's or higher than any of its children's.", async () => {
    const subcourt = subcourtTree.children[0]
    await expectThrow(
      klerosLiquid.changeSubcourtMinStake(
        subcourt.ID,
        subcourtTree.minStake - 1
      )
    )
    await expectThrow(
      klerosLiquid.changeSubcourtMinStake(
        subcourt.ID,
        subcourt.children[0].minStake + 1
      )
    )
  })

  it('Should validate all preconditions for passing phases.', async () => {
    let phase = Number(await klerosLiquid.phase())
    while (phase !== 0) {
      switch (phase) {
        case 2:
          await increaseTime(maxDrawingTime)
          break
        default:
          break
      }
      await klerosLiquid.passPhase()
      phase = (phase + 1) % 3
    }
    await expectThrow(klerosLiquid.passPhase())
    await increaseTime(minStakingTime)
    await expectThrow(klerosLiquid.passPhase())
    const extraData = `0x${(0).toString(16).padStart(64, '0')}${(1)
      .toString(16)
      .padStart(64, '0')}`
    await klerosLiquid.createDispute(2, extraData, {
      value: await klerosLiquid.arbitrationCost(extraData)
    })
    await klerosLiquid.passPhase()
    const zeroRNG = await ConstantNG.new(0)
    await klerosLiquid.changeRNGenerator(zeroRNG.address)
    await expectThrow(klerosLiquid.passPhase())
    await klerosLiquid.changeRNGenerator(RNG.address)
    await klerosLiquid.passPhase()
    await expectThrow(klerosLiquid.passPhase())
    await increaseTime(maxDrawingTime)
    await klerosLiquid.passPhase()
  })
})
