/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.

const BigNumber = web3.BigNumber
const {
  expectThrow
} = require('openzeppelin-solidity/test/helpers/expectThrow')
const {
  increaseTime
} = require('openzeppelin-solidity/test/helpers/increaseTime')

const GOVERNANCE = artifacts.require('Governance')
const ARBITRABLE_PERMISSION_LIST = artifacts.require('ArbitrablePermissionList')
const CENTRALIZED_ARBITRATOR = artifacts.require('CentralizedArbitrator')
const MINIME_TOKEN = artifacts.require('MiniMeToken')
const MINIME_TOKEN_FACTORY = artifacts.require('MiniMeTokenFactory')
const KLEROS_LIQUID = artifacts.require('KlerosLiquid')
const ConstantNG = artifacts.require('ConstantNG')

contract('Governance', function(accounts) {
  const PROPOSAL_QUORUM = 60
  const QUORUM_DIVIDE_TIME = 100
  const VOTING_TIME = 1000

  const CREATOR = accounts[1]
  const CREATOR_EXTRA_DATA = '0x707574546F566F74650000000000000000000000'
  const ARBITRATION_FEE = 4
  const STAKE = 10
  const TIME_TO_CHALLENGE = 0
  const META_EVIDENCE = 'evidence'
  const BLACKLIST = false
  const APPEND_ONLY = true
  const RECHALLENGE_POSSIBLE = false

  const MIN_STAKING_TIME = 1
  const MAX_DRAWINNG_TIME = 1

  let governance
  let arbitrablePermissionList
  let centralizedArbitrator
  let pinakion
  let tokenController
  let tokenFactory
  let RNG

  // const ITEM_STATUS = {
  //   ABSENT: 0,
  //   CLEARED: 1,
  //   RESUBMITTED: 2,
  //   REGISTERED: 3,
  //   SUBMITTED: 4,
  //   CLEARING_REQUESTED: 5,
  //   PREVENTIVE_CLEARING_REQUESTED: 6
  // }

  const PROPOSAL_STATE = {
    NEW: 0,
    PUT_TO_SUPPORT: 1,
    PUT_TO_VOTE: 2,
    DECIDED: 3
  }

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
      minJurors: randomInt(5, 3),
      jurorsForJump: randomInt(15, 3),
      timesPerPeriod: [...new Array(4)].map(_ => randomInt(5)),
      sortitionSumTreeK: randomInt(5),
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

  beforeEach('setup contract for each test', async function() {
    centralizedArbitrator = await CENTRALIZED_ARBITRATOR.new(ARBITRATION_FEE, {
      from: CREATOR
    })

    arbitrablePermissionList = await ARBITRABLE_PERMISSION_LIST.new(
      centralizedArbitrator.address,
      CREATOR_EXTRA_DATA,
      META_EVIDENCE,
      BLACKLIST,
      APPEND_ONLY,
      RECHALLENGE_POSSIBLE,
      STAKE,
      TIME_TO_CHALLENGE,
      {
        from: CREATOR
      }
    )

    tokenFactory = await MINIME_TOKEN_FACTORY.new({ from: CREATOR })

    pinakion = await MINIME_TOKEN.new(
      tokenFactory.address,
      0x0,
      0,
      'Pinakion',
      18,
      'PNK',
      true,
      {
        from: CREATOR
      }
    )
    for (let index = 0; index < 10; index++)
      pinakion.generateTokens(
        accounts[index],
        (await web3.eth.getBalance(CREATOR)).toNumber(),
        { from: CREATOR }
      )

    const RANDOM_NUMBER = 10
    RNG = await ConstantNG.new(RANDOM_NUMBER)

    const { subcourtTree } = generateSubcourts(randomInt(4, 2), 3)

    tokenController = await KLEROS_LIQUID.new(
      CREATOR,
      pinakion.address,
      RNG.address,
      MIN_STAKING_TIME,
      MAX_DRAWINNG_TIME,
      subcourtTree.hiddenVotes,
      subcourtTree.minStake,
      subcourtTree.alpha,
      subcourtTree.jurorFee,
      subcourtTree.minJurors,
      subcourtTree.jurorsForJump,
      subcourtTree.timesPerPeriod,
      subcourtTree.sortitionSumTreeK
    )

    await pinakion.changeController(tokenController.address, { from: CREATOR })

    assert.equal(await pinakion.controller(), tokenController.address) // Make sure that kleros liquid contract is the controller of the pinakion token

    governance = await GOVERNANCE.new(
      PROPOSAL_QUORUM,
      QUORUM_DIVIDE_TIME,
      VOTING_TIME,
      arbitrablePermissionList.address,
      pinakion.address,
      tokenController.address,
      { from: CREATOR }
    )

    await tokenController.changeGovernor(governance.address, { from: CREATOR })

    assert.equal(await tokenController.governor(), governance.address) // Make sure that governance contract is the governor of kleros liquid contract

    await governance.createAndRegisterProposal(
      'PROPOSAL_0',
      governance.address,
      0,
      'data',
      'descriptionURI',
      'descriptionHash',
      'argumentsURI',
      'argumentsHash',
      { from: CREATOR, gas: 3000000, value: 10000000 }
    )
    await governance.createAndRegisterProposal(
      'PROPOSAL_1',
      governance.address,
      0,
      'data',
      'descriptionURI',
      'descriptionHash',
      'argumentsURI',
      'argumentsHash',
      { from: CREATOR, gas: 3000000, value: 10000000 }
    )
    await governance.createAndRegisterProposal(
      'PROPOSAL_2',
      governance.address,
      0,
      'data',
      'descriptionURI',
      'descriptionHash',
      'argumentsURI',
      'argumentsHash',
      { from: CREATOR, gas: 3000000, value: 10000000 }
    )
  })

  // it('should be possible to request registration of a proposal to the proposal list', async function() {
  //   await governance.requestRegisteringProposal('PROPOSAL_0', {
  //     from: accounts[3],
  //     value: 10000000
  //   })
  //
  //   const PROPOSAL_LIST_ADDRESS = await governance.proposalList()
  //   const arbitrablePermissionList = web3.eth.contract(
  //     ARBITRABLE_PERMISSION_LIST.abi
  //   )
  //   const PROPOSAL_LIST = arbitrablePermissionList.at(PROPOSAL_LIST_ADDRESS)
  //
  //   const ACTUAL = (await PROPOSAL_LIST.items('PROPOSAL_0'))[0].toNumber()
  //   const EXPECTED = ITEM_STATUS.SUBMITTED
  //   assert.equal(ACTUAL, EXPECTED)
  // })

  it('should be possible to put a proposal to support', async function() {
    await governance.putProposalToSupport('PROPOSAL_0', {
      from: CREATOR,
      gas: 3000000
    })

    const ACTUAL = (await governance.proposals('PROPOSAL_0'))[7].toNumber()
    const EXPECTED = PROPOSAL_STATE.PUT_TO_SUPPORT
    assert.equal(ACTUAL, EXPECTED)
  })

  it('should be possible support a proposal', async function() {
    await governance.putProposalToSupport('PROPOSAL_0', {
      from: CREATOR,
      gas: 3000000
    })

    const QUORUM_TOKEN_ADDRESS = (await governance.proposals('PROPOSAL_0'))[9]
    const miniMeToken = web3.eth.contract(MINIME_TOKEN.abi)
    const QUORUM_TOKEN = miniMeToken.at(QUORUM_TOKEN_ADDRESS)

    const DEPOSIT_ADDRESS = await governance.supportDeposit()
    const TRANSFER_AMOUNT = await QUORUM_TOKEN.balanceOf(CREATOR)
    await QUORUM_TOKEN.transfer(DEPOSIT_ADDRESS, TRANSFER_AMOUNT, {
      from: CREATOR,
      gas: 3000000
    })

    const ACTUAL = QUORUM_TOKEN.balanceOf(DEPOSIT_ADDRESS).toNumber()
    const EXPECTED = TRANSFER_AMOUNT
    assert.equal(ACTUAL, EXPECTED)
  })

  it('should be possible to get required quorum for a proposal', async function() {
    await governance.putProposalToSupport('PROPOSAL_0', {
      from: CREATOR,
      gas: 3000000
    })

    const MULTIPLIER = 26

    await increaseTime(QUORUM_DIVIDE_TIME * MULTIPLIER)

    const ACTUAL = new BigNumber(
      await governance.getRequiredQuorum('PROPOSAL_0', {
        from: CREATOR
      })
    )
    const QUORUM_TOKEN_ADDRESS = (await governance.proposals('PROPOSAL_0'))[9]
    const miniMeToken = web3.eth.contract(MINIME_TOKEN.abi)
    const QUORUM_TOKEN = miniMeToken.at(QUORUM_TOKEN_ADDRESS)
    const EXPECTED = new BigNumber(await QUORUM_TOKEN.totalSupply())
      .div(100)
      .mul(PROPOSAL_QUORUM)
      .div(2 ** MULTIPLIER)

    // console.log(ACTUAL.toNumber())
    // console.log(EXPECTED.toFixed(0))
    assert(ACTUAL.equals(EXPECTED.toFixed(0)))
  })

  it('should be possible to put a proposal to vote', async function() {
    await governance.putProposalToSupport('PROPOSAL_0', {
      from: CREATOR,
      gas: 3000000
    })

    const QUORUM_TOKEN_ADDRESS = (await governance.proposals('PROPOSAL_0'))[9]
    const miniMeToken = web3.eth.contract(MINIME_TOKEN.abi)
    const QUORUM_TOKEN = miniMeToken.at(QUORUM_TOKEN_ADDRESS)
    const DEPOSIT_ADDRESS = await governance.supportDeposit()
    let TRANSFER_AMOUNT

    for (let i = 0; i < 6; i++) {
      TRANSFER_AMOUNT = await QUORUM_TOKEN.balanceOf(accounts[i])
      await QUORUM_TOKEN.transfer(DEPOSIT_ADDRESS, TRANSFER_AMOUNT, {
        from: accounts[i],
        gas: 3000000
      })
    }

    await governance.putProposalToVote('PROPOSAL_0', {
      from: accounts[9],
      gas: 3000000
    })

    const ACTUAL = (await governance.proposals('PROPOSAL_0'))[7].toNumber()
    const EXPECTED = PROPOSAL_STATE.PUT_TO_VOTE
    assert.equal(ACTUAL, EXPECTED)
  })

  it('should be possible to vote a proposal', async function() {
    await governance.putProposalToSupport('PROPOSAL_0', {
      from: CREATOR,
      gas: 3000000
    })

    const QUORUM_TOKEN_ADDRESS = (await governance.proposals('PROPOSAL_0'))[9]
    const miniMeToken = web3.eth.contract(MINIME_TOKEN.abi)
    const QUORUM_TOKEN = miniMeToken.at(QUORUM_TOKEN_ADDRESS)
    let DEPOSIT_ADDRESS = await governance.supportDeposit()
    let TRANSFER_AMOUNT
    for (let i = 0; i < 6; i++) {
      TRANSFER_AMOUNT = await QUORUM_TOKEN.balanceOf(accounts[i])
      await QUORUM_TOKEN.transfer(DEPOSIT_ADDRESS, TRANSFER_AMOUNT, {
        from: accounts[i],
        gas: 3000000
      })
    }

    await governance.putProposalToVote('PROPOSAL_0', {
      from: CREATOR,
      gas: 3000000
    })

    const VOTE_TOKEN_ADDRESS = (await governance.proposals('PROPOSAL_0'))[10]
    const VOTE_TOKEN = miniMeToken.at(VOTE_TOKEN_ADDRESS)
    DEPOSIT_ADDRESS = await governance.approvalDeposit()
    TRANSFER_AMOUNT = await VOTE_TOKEN.balanceOf(CREATOR)
    await VOTE_TOKEN.transfer(DEPOSIT_ADDRESS, TRANSFER_AMOUNT, {
      from: CREATOR,
      gas: 3000000
    })

    const ACTUAL = VOTE_TOKEN.balanceOf(DEPOSIT_ADDRESS).toNumber()
    const EXPECTED = TRANSFER_AMOUNT
    assert.equal(ACTUAL, EXPECTED)
  })

  it('should be possible to finalize a voting', async function() {
    await governance.putProposalToSupport('PROPOSAL_0', {
      from: CREATOR,
      gas: 3000000
    })

    const QUORUM_TOKEN_ADDRESS = (await governance.proposals('PROPOSAL_0'))[9]
    const miniMeToken = web3.eth.contract(MINIME_TOKEN.abi)
    const QUORUM_TOKEN = miniMeToken.at(QUORUM_TOKEN_ADDRESS)
    let DEPOSIT_ADDRESS = await governance.supportDeposit()
    let TRANSFER_AMOUNT
    for (let i = 0; i < 7; i++) {
      TRANSFER_AMOUNT = await QUORUM_TOKEN.balanceOf(accounts[i])
      await QUORUM_TOKEN.transfer(DEPOSIT_ADDRESS, TRANSFER_AMOUNT, {
        from: accounts[i],
        gas: 3000000
      })
    }

    await governance.putProposalToVote('PROPOSAL_0', {
      from: CREATOR,
      gas: 3000000
    })

    const VOTE_TOKEN_ADDRESS = (await governance.proposals('PROPOSAL_0'))[10]
    const VOTE_TOKEN = miniMeToken.at(VOTE_TOKEN_ADDRESS)
    DEPOSIT_ADDRESS = await governance.approvalDeposit()
    TRANSFER_AMOUNT = await VOTE_TOKEN.balanceOf(CREATOR)
    await VOTE_TOKEN.transfer(DEPOSIT_ADDRESS, TRANSFER_AMOUNT, {
      from: CREATOR,
      gas: 3000000
    })

    await increaseTime(VOTING_TIME)

    await governance.finalizeVoting('PROPOSAL_0')

    const ACTUAL = (await governance.proposals('PROPOSAL_0'))[7].toNumber()
    const EXPECTED = PROPOSAL_STATE.DECIDED
    assert.equal(ACTUAL, EXPECTED)
  })

  it('should be possible to execute a complex scenario with 3 proposals, 5 participants and 10 accounts.', async function() {
    await governance.putProposalToSupport('PROPOSAL_0', {
      from: accounts[0],
      gas: 3000000
    })

    await governance.putProposalToSupport('PROPOSAL_1', {
      from: accounts[0],
      gas: 3000000
    })

    await governance.putProposalToSupport('PROPOSAL_2', {
      from: accounts[0],
      gas: 3000000
    })

    /* Define MiniMeToken and support address */
    const miniMeToken = web3.eth.contract(MINIME_TOKEN.abi)
    const SUPPORT_DEPOSIT_ADDRESS = await governance.supportDeposit()

    /* Define target quorum token */
    const PROPOSAL0_QUORUM_TOKEN_ADDRESS = (await governance.proposals(
      'PROPOSAL_0'
    ))[9]
    const PROPOSAL0_QUORUM_TOKEN = miniMeToken.at(
      PROPOSAL0_QUORUM_TOKEN_ADDRESS
    )

    let TRANSFER_AMOUNT
    let sender

    /* Make transfers for supporting */

    for (let i = 0; i < 3; i++) {
      sender = accounts[i]
      TRANSFER_AMOUNT = await PROPOSAL0_QUORUM_TOKEN.balanceOf(sender)
      await PROPOSAL0_QUORUM_TOKEN.transfer(
        SUPPORT_DEPOSIT_ADDRESS,
        TRANSFER_AMOUNT,
        {
          from: sender,
          gas: 3000000
        }
      )
    }

    /* Define target quorum token */
    const PROPOSAL1_QUORUM_TOKEN_ADDRESS = (await governance.proposals(
      'PROPOSAL_1'
    ))[9]
    const PROPOSAL1_QUORUM_TOKEN = miniMeToken.at(
      PROPOSAL1_QUORUM_TOKEN_ADDRESS
    )

    /* Make transfers for supporting */

    for (let i = 0; i < 5; i++) {
      sender = accounts[i]
      TRANSFER_AMOUNT = await PROPOSAL1_QUORUM_TOKEN.balanceOf(sender)
      await PROPOSAL1_QUORUM_TOKEN.transfer(
        SUPPORT_DEPOSIT_ADDRESS,
        TRANSFER_AMOUNT,
        {
          from: sender,
          gas: 3000000
        }
      )
    }

    /* Define target quorum token */
    const PROPOSAL2_QUORUM_TOKEN_ADDRESS = (await governance.proposals(
      'PROPOSAL_2'
    ))[9]
    const PROPOSAL2_QUORUM_TOKEN = miniMeToken.at(
      PROPOSAL2_QUORUM_TOKEN_ADDRESS
    )
    /* Make transfers for supporting */

    for (let i = 0; i < 6; i++) {
      sender = accounts[i]
      TRANSFER_AMOUNT = await PROPOSAL2_QUORUM_TOKEN.balanceOf(sender)
      await PROPOSAL2_QUORUM_TOKEN.transfer(
        SUPPORT_DEPOSIT_ADDRESS,
        TRANSFER_AMOUNT,
        {
          from: sender,
          gas: 3000000
        }
      )
    }

    // Increase time to lower required quorum for proposal 1
    await increaseTime(QUORUM_DIVIDE_TIME)

    await governance.putProposalToVote('PROPOSAL_0', {
      from: accounts[9],
      gas: 3000000
    })

    // Quorum required reset because we put proposal 1 to support, so this will revert
    await expectThrow(governance.putProposalToVote('PROPOSAL_1'), {
      from: accounts[9],
      gas: 3000000
    })

    await (governance.putProposalToVote('PROPOSAL_2'),
    {
      from: accounts[9],
      gas: 3000000
    })

    /* Define vote address */
    const APPROVAL_DEPOSIT_ADDRESS = await governance.approvalDeposit()
    const REJECTION_DEPOSIT_ADDRESS = await governance.rejectionDeposit()

    /* Define target vote token */
    const PROPOSAL0_VOTE_TOKEN_ADDRESS = (await governance.proposals(
      'PROPOSAL_0'
    ))[10]
    const PROPOSAL0_VOTE_TOKEN = miniMeToken.at(PROPOSAL0_VOTE_TOKEN_ADDRESS)

    /* Make transfers for voting */

    for (let i = 0; i < 3; i++) {
      sender = accounts[i]
      TRANSFER_AMOUNT = await PROPOSAL0_VOTE_TOKEN.balanceOf(sender)
      await PROPOSAL0_VOTE_TOKEN.transfer(
        APPROVAL_DEPOSIT_ADDRESS,
        TRANSFER_AMOUNT,
        {
          from: sender,
          gas: 3000000
        }
      )
    }

    for (let i = 3; i < 5; i++) {
      sender = accounts[i]
      TRANSFER_AMOUNT = await PROPOSAL0_VOTE_TOKEN.balanceOf(sender)
      await PROPOSAL0_VOTE_TOKEN.transfer(
        REJECTION_DEPOSIT_ADDRESS,
        TRANSFER_AMOUNT,
        {
          from: sender,
          gas: 3000000
        }
      )
    }

    /* Define target vote token */
    const PROPOSAL1_VOTE_TOKEN_ADDRESS = (await governance.proposals(
      'PROPOSAL_1'
    ))[10]

    assert.equal(
      PROPOSAL1_VOTE_TOKEN_ADDRESS,
      '0x0000000000000000000000000000000000000000'
    )

    /* Define target vote token */
    const PROPOSAL2_VOTE_TOKEN_ADDRESS = (await governance.proposals(
      'PROPOSAL_2'
    ))[10]
    const PROPOSAL2_VOTE_TOKEN = miniMeToken.at(PROPOSAL2_VOTE_TOKEN_ADDRESS)

    /* Make transfers for voting */

    for (let i = 0; i < 4; i++) {
      sender = accounts[i]
      TRANSFER_AMOUNT = await PROPOSAL2_VOTE_TOKEN.balanceOf(sender)
      await PROPOSAL2_VOTE_TOKEN.transfer(
        APPROVAL_DEPOSIT_ADDRESS,
        TRANSFER_AMOUNT,
        {
          from: sender,
          gas: 3000000
        }
      )
    }

    for (let i = 4; i < 9; i++) {
      sender = accounts[i]
      TRANSFER_AMOUNT = await PROPOSAL2_VOTE_TOKEN.balanceOf(sender)
      await PROPOSAL2_VOTE_TOKEN.transfer(
        REJECTION_DEPOSIT_ADDRESS,
        TRANSFER_AMOUNT,
        {
          from: sender,
          gas: 3000000
        }
      )
    }

    await increaseTime(VOTING_TIME)

    await governance.finalizeVoting('PROPOSAL_0')
    await expectThrow(governance.finalizeVoting('PROPOSAL_1'))
    await governance.finalizeVoting('PROPOSAL_2')

    let ACTUAL = (await governance.proposals('PROPOSAL_0'))[7].toNumber()
    let EXPECTED = PROPOSAL_STATE.DECIDED
    assert.equal(ACTUAL, EXPECTED)

    ACTUAL = (await governance.proposals('PROPOSAL_0'))[11]
    EXPECTED = true
    assert.equal(ACTUAL, EXPECTED)

    ACTUAL = (await governance.proposals('PROPOSAL_1'))[7].toNumber()
    EXPECTED = PROPOSAL_STATE.PUT_TO_SUPPORT
    assert.equal(ACTUAL, EXPECTED)

    ACTUAL = (await governance.proposals('PROPOSAL_2'))[7].toNumber()
    EXPECTED = PROPOSAL_STATE.DECIDED
    assert.equal(ACTUAL, EXPECTED)

    ACTUAL = (await governance.proposals('PROPOSAL_2'))[11]
    EXPECTED = PROPOSAL_STATE.DECIDED
    assert.equal(ACTUAL, false)
  })

  // For this test I need web3 1.0.0-beta36 for encoding function call. // Update, try using this: myContract.myMethod.getData(...args)
  //   it('should be possible to execute a proposal', async function() {
  //     const DESTINATION = governance.address
  //     const AMOUNT = 0
  //     console.log(web3)
  //     const DATA = web3.eth.abi.encodeFunctionCall({
  //     name: 'setVotingTime',
  //     type: 'function',
  //     inputs: [{
  //         type: 'uint256',
  //         name: '_votingTime'
  //     }]
  // }, ['3000']);
  //
  //     const URI_DESCRIPTION = "description"
  //     const URI_ARGUMENTS = "arguments"
  //
  //     await governance.createProposal("PROPOSAL_0", )
  //
  //     await governance.requestRegisteringProposal("PROPOSAL_0", {
  //       from: accounts[3], value: 10000000
  //     })
  //
  //     await governance.putProposalToSupport("PROPOSAL_0", {
  //         from: CREATOR, gas: 3000000
  //     })
  //
  //     const QUORUM_TOKEN_ADDRESS = (await governance.proposals("PROPOSAL_0"))[9]
  //     let miniMeToken = web3.eth.contract(MINIME_TOKEN.abi)
  //     const QUORUM_TOKEN = miniMeToken.at(QUORUM_TOKEN_ADDRESS)
  //     let DEPOSIT_ADDRESS = await governance.supportDeposit()
  //     let TRANSFER_AMOUNT = await QUORUM_TOKEN.balanceOf(CREATOR)
  //     await QUORUM_TOKEN.transfer(DEPOSIT_ADDRESS, TRANSFER_AMOUNT, {from: CREATOR, gas: 3000000})
  //
  //     await governance.putProposalToVote("PROPOSAL_0", {
  //       from: CREATOR, gas: 3000000
  //     })
  //
  //     const VOTE_TOKEN_ADDRESS = (await governance.proposals("PROPOSAL_0"))[10]
  //     const VOTE_TOKEN = miniMeToken.at(QUORUM_TOKEN_ADDRESS)
  //     DEPOSIT_ADDRESS = await governance.approvalDeposit()
  //     TRANSFER_AMOUNT = await VOTE_TOKEN.balanceOf(CREATOR)
  //     await VOTE_TOKEN.transfer(DEPOSIT_ADDRESS, TRANSFER_AMOUNT, {from: CREATOR, gas: 3000000})
  //
  //     await increaseTime(2000)
  //
  //     await governance.finalizeVoting("PROPOSAL_0")
  //
  //     await governance.executeProposal("PROPOSAL_0")
  //   })
})
