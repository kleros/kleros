/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.
const { soliditySha3 } = require('web3-utils')
const {
  expectThrow
} = require('openzeppelin-solidity/test/helpers/expectThrow')
const {
  increaseTime
} = require('openzeppelin-solidity/test/helpers/increaseTime')

const KlerosGovernor = artifacts.require('KlerosGovernor')
const Arbitrator = artifacts.require(
  '@kleros/kleros-interaction/contracts/standard/arbitration/EnhancedAppealableArbitrator.sol'
)

contract('KlerosGovernor', function(accounts) {
  const general = accounts[0]
  const submitter1 = accounts[1]
  const submitter2 = accounts[2]
  const submitter3 = accounts[3]
  const other = accounts[4]
  const submissionDeposit = 1e18
  const submissionTimeout = 3600
  const withdrawTimeout = 100
  const sharedMultiplier = 5000
  const winnerMultiplier = 2000
  const loserMultiplier = 7000
  const arbitrationFee = 1e17
  const arbitratorExtraData = 0x85
  const appealTimeout = 1200
  const MULTIPLIER_DIVISOR = 10000

  const gasPrice = 5000000000

  let arbitrator
  let klerosgovernor
  beforeEach('initialize the contract', async function() {
    arbitrator = await Arbitrator.new(
      arbitrationFee,
      general,
      arbitratorExtraData,
      appealTimeout,
      { from: general }
    )

    await arbitrator.changeArbitrator(arbitrator.address)

    klerosgovernor = await KlerosGovernor.new(
      arbitrator.address,
      arbitratorExtraData,
      submissionDeposit,
      submissionTimeout,
      withdrawTimeout,
      sharedMultiplier,
      winnerMultiplier,
      loserMultiplier,
      { from: general }
    )
  })

  it('Should set correct values in constructor', async () => {
    assert.equal(await klerosgovernor.arbitrator(), arbitrator.address)
    assert.equal(await klerosgovernor.arbitratorExtraData(), 0x85)
    assert.equal((await klerosgovernor.submissionDeposit()).toNumber(), 1e18)
    assert.equal((await klerosgovernor.submissionTimeout()).toNumber(), 3600)
    assert.equal((await klerosgovernor.withdrawTimeout()).toNumber(), 100)
    assert.equal((await klerosgovernor.sharedMultiplier()).toNumber(), 5000)
    assert.equal((await klerosgovernor.winnerMultiplier()).toNumber(), 2000)
    assert.equal((await klerosgovernor.loserMultiplier()).toNumber(), 7000)
    assert.equal((await klerosgovernor.getCurrentSessionNumber()).toNumber(), 0)
  })

  it('Only governor should be allowed to change contract parameters', async () => {
    await expectThrow(
      klerosgovernor.changeSubmissionDeposit(20, { from: general })
    )
    await expectThrow(
      klerosgovernor.changeSubmissionTimeout(51, { from: submitter1 })
    )
    await expectThrow(
      klerosgovernor.changeWithdrawTimeout(23, { from: submitter2 })
    )
    await expectThrow(
      klerosgovernor.changeSharedMultiplier(200, { from: general })
    )
    await expectThrow(
      klerosgovernor.changeWinnerMultiplier(250, { from: submitter1 })
    )
    await expectThrow(
      klerosgovernor.changeLoserMultiplier(330, { from: submitter2 })
    )
  })

  it('Should set correct values in a newly submitted list', async () => {
    let index1
    let index2
    let dataString

    // Should fail if arrays are not the same length. We check between arrays having 0 and 1 length so we don't have to deal with tx order requirement.
    await expectThrow(
      klerosgovernor.submitList(
        [klerosgovernor.address],
        [],
        '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
        [36],
        { from: submitter1, value: submissionDeposit }
      )
    )
    await expectThrow(
      klerosgovernor.submitList(
        [],
        [1e17],
        '0x246c76df0000000000000000000000000000000000000000000000000000000000000014953d6651000000000000000000000000000000000000000000000000000000000000fb',
        [71],
        { from: submitter1, value: submissionDeposit }
      )
    )
    await expectThrow(
      klerosgovernor.submitList(
        [klerosgovernor.address],
        [10],
        '0x246c76df0000000000000000000000000000000000000000000000000000000000000014953d6651000000000000000000000000000000000000000000000000000000000000fb',
        [],
        { from: submitter1, value: submissionDeposit }
      )
    )

    // Should fail when submitting less
    await expectThrow(
      klerosgovernor.submitList(
        [klerosgovernor.address],
        [10, 1e17],
        '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
        [36],
        { from: submitter1, value: submissionDeposit - 1000 }
      )
    )

    const addresses = [klerosgovernor.address, arbitrator.address]
    const values = [10, 1e17]
    const data = [36, 35]
    const txHash1 = parseInt(
      soliditySha3(
        klerosgovernor.address,
        10,
        '0x246c76df0000000000000000000000000000000000000000000000000000000000000014'
      ),
      16
    )
    const txHash2 = parseInt(
      soliditySha3(
        arbitrator.address,
        1e17,
        '0x953d6651000000000000000000000000000000000000000000000000000000000000fb'
      ),
      16
    )

    if (txHash1 < txHash2) {
      index1 = 0
      index2 = 1
      dataString =
        '0x246c76df0000000000000000000000000000000000000000000000000000000000000014953d6651000000000000000000000000000000000000000000000000000000000000fb'
    } else {
      index1 = 1
      index2 = 0
      dataString =
        '0x953d6651000000000000000000000000000000000000000000000000000000000000fb246c76df0000000000000000000000000000000000000000000000000000000000000014'
    }

    await klerosgovernor.submitList(
      [addresses[index1], addresses[index2]],
      [values[index1], values[index2]],
      dataString,
      [data[index1], data[index2]],
      { from: submitter1, value: submissionDeposit }
    )

    const submission = await klerosgovernor.submissions(0)

    assert.equal(
      submission[0],
      submitter1,
      'The sender of the list is incorrect'
    )
    assert.equal(
      submission[1].toNumber(),
      1e18,
      'The deposit of the list is incorrect'
    )
    const submissionLength = await klerosgovernor.getNumberOfTransactions(0)
    assert.equal(
      submissionLength.toNumber(),
      2,
      'The number of transactions is incorrect'
    )

    tx1 = await klerosgovernor.getTransactionInfo(0, index1)
    assert.equal(
      tx1[0],
      klerosgovernor.address,
      'The target of the first transaction is incorrect'
    )
    assert.equal(
      tx1[1].toNumber(),
      10,
      'The value of the first transaction is incorrect'
    )
    assert.equal(
      tx1[2],
      '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
      'The data of the first transaction is incorrect'
    )

    tx2 = await klerosgovernor.getTransactionInfo(0, index2)
    assert.equal(
      tx2[0],
      arbitrator.address,
      'The target of the second transaction is incorrect'
    )
    assert.equal(
      tx2[1].toNumber(),
      1e17,
      'The value of the second transaction is incorrect'
    )
    assert.equal(
      tx2[2],
      '0x953d6651000000000000000000000000000000000000000000000000000000000000fb',
      'The data of the second transaction is incorrect'
    )

    let hash1
    let hash2
    // Swap indexes if txs order is reversed.
    if (txHash1 < txHash2) {
      hash1 = soliditySha3(soliditySha3(tx1[0], tx1[1], tx1[2]), 0)
      hash2 = soliditySha3(tx2[0], tx2[1], tx2[2])
    } else {
      hash1 = soliditySha3(soliditySha3(tx2[0], tx2[1], tx2[2]), 0)
      hash2 = soliditySha3(tx1[0], tx1[1], tx1[2])
    }
    const listHash = soliditySha3(hash2, hash1)
    assert.equal(submission[2], listHash, 'The list hash is incorrect')

    await increaseTime(submissionTimeout + 1)
    // Shouldn't be possible to submit after submission timeout
    await expectThrow(
      klerosgovernor.submitList(
        [klerosgovernor.address],
        [180],
        '0xfdea',
        [2],
        { from: submitter2, value: submissionDeposit }
      )
    )
  })

  it('Should not allow to submit a duplicate list', async () => {
    await klerosgovernor.submitList(
      [klerosgovernor.address],
      [10],
      '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
      [36],
      { from: submitter1, value: submissionDeposit }
    )
    // Check the case with the same and with different submitters.
    await expectThrow(
      klerosgovernor.submitList(
        [klerosgovernor.address],
        [10],
        '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
        [36],
        { from: submitter1, value: submissionDeposit }
      )
    )

    await expectThrow(
      klerosgovernor.submitList(
        [klerosgovernor.address],
        [10],
        '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
        [36],
        { from: submitter2, value: submissionDeposit }
      )
    )
  })

  it('Should correctly withdraw submitted list', async () => {
    await klerosgovernor.submitList(
      [klerosgovernor.address],
      [10],
      '0xfdea',
      [2],
      { from: submitter1, value: submissionDeposit }
    )

    await klerosgovernor.submitList(
      [klerosgovernor.address],
      [10],
      '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
      [36],
      { from: submitter2, value: submissionDeposit }
    )

    let submittedLists = await klerosgovernor.getSubmittedLists(0)
    assert.equal(submittedLists.length, 2, 'The submission count is incorrect')
    let sessionInfo = await klerosgovernor.sessions(0)
    assert.equal(
      sessionInfo[2].toNumber(),
      2e18,
      'The sum of submission deposits is incorrect'
    )
    const oldBalance = await web3.eth.getBalance(submitter2)

    const list2Info = await klerosgovernor.submissions(1)
    const list2Hash = await list2Info[2]

    // Shouldn't be possible to withdraw someone else's list
    await expectThrow(
      klerosgovernor.withdrawTransactionList(1, list2Hash, { from: submitter1 })
    )
    const tx = await klerosgovernor.withdrawTransactionList(1, list2Hash, {
      from: submitter2,
      gasPrice: gasPrice
    })
    const txFee = tx.receipt.gasUsed * gasPrice

    submittedLists = await klerosgovernor.getSubmittedLists(0)
    assert.equal(
      submittedLists.length,
      1,
      'The submission count after withdrawal is incorrect'
    )
    sessionInfo = await klerosgovernor.sessions(0)
    assert.equal(
      sessionInfo[2].toNumber(),
      1e18,
      'The sum of submission deposits after withdrawal is incorrect'
    )
    const newBalance = await web3.eth.getBalance(submitter2)
    assert.equal(
      newBalance.toString(),
      oldBalance
        .plus(1e18)
        .minus(txFee)
        .toString(),
      'Incorrect balance after withdrawal'
    )

    await increaseTime(withdrawTimeout + 1)
    const list1Info = await klerosgovernor.submissions(0)
    const list1Hash = await list1Info[2]
    // Shouldn't be possible to withdraw after timeout
    await expectThrow(
      klerosgovernor.withdrawTransactionList(0, list1Hash, { from: submitter1 })
    )
  })

  it('Should switch to approval period if no lists were submitted', async () => {
    // Shouldn't be possible to switch to approval period before timeout
    await expectThrow(klerosgovernor.executeSubmissions({ from: general }))

    await increaseTime(submissionTimeout + 1)
    await klerosgovernor.executeSubmissions({ from: general })

    assert.equal((await klerosgovernor.getCurrentSessionNumber()).toNumber(), 1)
    // Check that submissions are working in the new submitting session
    await klerosgovernor.submitList(
      [klerosgovernor.address],
      [10],
      '0xfdea',
      [2],
      { from: submitter1, value: submissionDeposit }
    )

    const submittedLists = await klerosgovernor.getSubmittedLists(1)
    assert.equal(
      submittedLists.length,
      1,
      'The submission count in the new session is incorrect'
    )

    const sessionInfo = await klerosgovernor.sessions(0)
    assert.equal(
      sessionInfo[3].toNumber(),
      2,
      'Previous session should have status resolved'
    )
  })

  it('Should approve a list if there is only one submission and change period', async () => {
    await klerosgovernor.submitList(
      [klerosgovernor.address],
      [10],
      '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
      [36],
      { from: submitter1, value: submissionDeposit }
    )

    await increaseTime(submissionTimeout + 1)
    const oldBalance = await web3.eth.getBalance(submitter1)

    await klerosgovernor.executeSubmissions({ from: general })
    const newBalance = await web3.eth.getBalance(submitter1)

    const submission = await klerosgovernor.submissions(0)
    assert.equal(submission[4], true, 'The list should be approved')
    assert.equal(
      newBalance.toString(),
      oldBalance.plus(1e18).toString(),
      'Incorrect submitter balance after approval'
    )

    let submittedLists = await klerosgovernor.getSubmittedLists(1)
    assert.equal(
      submittedLists.length,
      0,
      'The submission count should be set to 0 right after approval'
    )

    let sessionInfo = await klerosgovernor.sessions(1)
    assert.equal(
      sessionInfo[2].toNumber(),
      0,
      'The sum of the deposits should be set to 0 right after approval'
    )

    // Check that submissions are working in the new submitting session
    await klerosgovernor.submitList([], [], '', [], {
      from: submitter2,
      value: submissionDeposit
    })

    submittedLists = await klerosgovernor.getSubmittedLists(1)
    assert.equal(
      submittedLists.length,
      1,
      'The submission count in the new session is incorrect'
    )

    sessionInfo = await klerosgovernor.sessions(1)
    assert.equal(
      sessionInfo[2].toNumber(),
      1e18,
      'The sum of the deposits in the new session is incorrect'
    )

    const numberOfLists = await klerosgovernor.getNumberOfCreatedLists()
    assert.equal(
      numberOfLists.toNumber(),
      2,
      'The number of created lists is incorrect'
    )

    sessionInfo = await klerosgovernor.sessions(0)
    assert.equal(
      sessionInfo[3].toNumber(),
      2,
      'Previous session should have status resolved'
    )
  })

  it('Should create a dispute in arbitrator contract if more than one list was submitted', async () => {
    await klerosgovernor.submitList(
      [klerosgovernor.address],
      [10],
      '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
      [36],
      { from: submitter1, value: submissionDeposit }
    )

    await klerosgovernor.submitList([arbitrator.address], [10], '0x2462', [2], {
      from: submitter2,
      value: submissionDeposit
    })

    await klerosgovernor.submitList([], [], '0x24621111', [], {
      from: submitter3,
      value: submissionDeposit
    })

    await increaseTime(submissionTimeout + 1)
    let sessionInfo = await klerosgovernor.sessions(0)
    const oldSumDeposit = await sessionInfo[2]

    await klerosgovernor.executeSubmissions({ from: general })

    sessionInfo = await klerosgovernor.sessions(0)
    const newSumDeposit = await sessionInfo[2]

    assert.equal(
      oldSumDeposit.toNumber() - 1e17,
      newSumDeposit.toNumber(),
      'The sum of the deposits after dispute creation is incorrect'
    )

    assert.equal(
      sessionInfo[3].toNumber(),
      1,
      'Incorrect status after dispute creation'
    )

    const dispute = await arbitrator.disputes(0)
    assert.equal(
      dispute[0],
      klerosgovernor.address,
      'Arbitrable not set up properly'
    )
    assert.equal(
      dispute[1].toNumber(),
      3,
      'Number of choices not set up properly'
    )
    assert.equal(
      dispute[2].toNumber(),
      1e17,
      'Arbitration fee not set up properly'
    )

    // Shouldn't be possible to approve after dispute is created
    await expectThrow(klerosgovernor.executeSubmissions({ from: general }))
  })

  it('Should enforce a correct ruling to the dispute with no appeals', async () => {
    await klerosgovernor.submitList(
      [klerosgovernor.address],
      [10],
      '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
      [36],
      { from: submitter1, value: submissionDeposit }
    )

    await klerosgovernor.submitList([arbitrator.address], [10], '0x2462', [2], {
      from: submitter2,
      value: submissionDeposit
    })

    await klerosgovernor.submitList([], [], '0x24621111', [], {
      from: submitter3,
      value: submissionDeposit
    })

    await increaseTime(submissionTimeout + 1)

    await klerosgovernor.executeSubmissions({ from: general })

    let sessionInfo = await klerosgovernor.sessions(0)

    await arbitrator.giveRuling(0, 1)
    await increaseTime(appealTimeout + 1)

    const oldBalance1 = await web3.eth.getBalance(submitter1)
    const oldBalance2 = await web3.eth.getBalance(submitter2)
    const oldBalance3 = await web3.eth.getBalance(submitter3)

    await arbitrator.giveRuling(0, 1)

    const newBalance1 = await web3.eth.getBalance(submitter1)
    const newBalance2 = await web3.eth.getBalance(submitter2)
    const newBalance3 = await web3.eth.getBalance(submitter3)

    assert.equal(
      newBalance1.toString(),
      oldBalance1.plus(sessionInfo[2]).toString(),
      'Incorrect balance of the winning party after ruling'
    )
    // Balances of losing parties should stay the same
    assert.equal(
      newBalance2.toString(),
      oldBalance2.toString(),
      'Incorrect balance of the first losing party after ruling'
    )
    assert.equal(
      newBalance3.toString(),
      oldBalance3.toString(),
      'Incorrect balance of the second losing party after ruling'
    )

    const submission = await klerosgovernor.submissions(0)

    assert.equal(submission[4], true, 'The winning list should be approved')

    const submittedLists = await klerosgovernor.getSubmittedLists(1)
    assert.equal(
      submittedLists.length,
      0,
      'The submission count should be 0 in the new session'
    )

    sessionInfo = await klerosgovernor.sessions(1)
    assert.equal(
      sessionInfo[2].toNumber(),
      0,
      'The sum of the deposits should be 0 in the new session'
    )

    assert.equal(
      sessionInfo[3].toNumber(),
      0,
      'Status should be 0 in the new session'
    )

    // Check that previous session stored correct values.
    sessionInfo = await klerosgovernor.sessions(0)
    assert.equal(sessionInfo[0].toNumber(), 1, 'The ruling was set incorrectly')

    assert.equal(
      sessionInfo[3].toNumber(),
      2,
      'Previous session should have status resolved'
    )
  })

  it('Should enforce a correct ruling to the dispute after appeal', async () => {
    await klerosgovernor.submitList(
      [klerosgovernor.address],
      [10],
      '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
      [36],
      { from: submitter1, value: submissionDeposit }
    )

    await klerosgovernor.submitList([arbitrator.address], [10], '0x2462', [2], {
      from: submitter2,
      value: submissionDeposit
    })

    await klerosgovernor.submitList([], [], '0x24621111', [], {
      from: submitter3,
      value: submissionDeposit
    })

    await increaseTime(submissionTimeout + 1)

    await klerosgovernor.executeSubmissions({ from: general })

    // Ruling 1 is equal to 0 submission index (submitter1)
    await arbitrator.giveRuling(0, 1)
    // Appeal fee is the same as arbitration fee for this arbitrator
    const loserAppealFee =
      arbitrationFee + (arbitrationFee * loserMultiplier) / MULTIPLIER_DIVISOR

    await klerosgovernor.fundAppeal(1, {
      from: submitter2,
      value: loserAppealFee
    })

    // Check that it's not possible to pay appeal fee twice
    await expectThrow(
      klerosgovernor.fundAppeal(1, {
        from: submitter2,
        value: loserAppealFee
      })
    )

    // Check that it's not possible to fund an out-of-bounds submission.
    await expectThrow(
      klerosgovernor.fundAppeal(3, {
        from: other,
        value: 5e18
      })
    )

    await increaseTime(appealTimeout / 2 + 1)

    // Check that the 2nd loser can't pay in 2nd half
    await expectThrow(
      klerosgovernor.fundAppeal(2, {
        from: submitter3,
        value: loserAppealFee
      })
    )

    const winnerAppealFee =
      arbitrationFee + (arbitrationFee * winnerMultiplier) / MULTIPLIER_DIVISOR

    await klerosgovernor.fundAppeal(0, {
      from: submitter1,
      value: winnerAppealFee
    })

    const oldBalance1 = await web3.eth.getBalance(submitter1)
    const oldBalance2 = await web3.eth.getBalance(submitter2)
    const oldBalance3 = await web3.eth.getBalance(submitter3)

    // Change the ruling to submitter2.
    await arbitrator.giveRuling(1, 2)
    await increaseTime(appealTimeout + 1)
    await arbitrator.giveRuling(1, 2)

    const newBalance1 = await web3.eth.getBalance(submitter1)
    const newBalance2 = await web3.eth.getBalance(submitter2) // winner
    const newBalance3 = await web3.eth.getBalance(submitter3)

    // Winner also gets rewarded with losing parties' appeal fees but he gets them through another function.
    assert.equal(
      newBalance1.toString(),
      oldBalance1.toString(),
      'Incorrect balance of the first losing party after appealed ruling'
    )
    assert.equal(
      newBalance2.toString(),
      oldBalance2
        .plus(3e18)
        .minus(1e17)
        .toString(),
      'Incorrect balance of the winning party after appealed ruling'
    )
    assert.equal(
      newBalance3.toString(),
      oldBalance3.toString(),
      'Incorrect balance of the second losing party after appealed ruling'
    )
    const submission = await klerosgovernor.submissions(1)
    assert.equal(submission[4], true, 'The winning list should be approved')

    const sessionInfo = await klerosgovernor.sessions(0)
    assert.equal(sessionInfo[0].toNumber(), 2, 'The ruling was set incorrectly')
  })

  it('Should change the ruling if loser paid appeal fees while the winner did not', async () => {
    await klerosgovernor.submitList(
      [klerosgovernor.address],
      [10],
      '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
      [36],
      { from: submitter1, value: submissionDeposit }
    )

    await klerosgovernor.submitList([arbitrator.address], [10], '0x2462', [2], {
      from: submitter2,
      value: submissionDeposit
    })

    await increaseTime(submissionTimeout + 1)

    await klerosgovernor.executeSubmissions({ from: general })
    // Ruling 1 means arbitrator ruled in favor of submitter1
    await arbitrator.giveRuling(0, 1)

    const loserAppealFee =
      arbitrationFee + (arbitrationFee * loserMultiplier) / MULTIPLIER_DIVISOR

    await klerosgovernor.fundAppeal(1, {
      from: submitter2,
      value: loserAppealFee
    })

    const shadowWinner = await klerosgovernor.shadowWinner()
    assert.equal(
      shadowWinner.toNumber(),
      1,
      'The shadow winner was not tracked correctly by the contract'
    )

    await increaseTime(appealTimeout + 1)
    await arbitrator.giveRuling(0, 1)

    const losingList = await klerosgovernor.submissions(0)
    assert.equal(
      losingList[4],
      false,
      'The first list should not be approved because it did not pay appeal fees'
    )
    const winningList = await klerosgovernor.submissions(1)
    assert.equal(winningList[4], true, 'The second list should be approved')

    const sessionInfo = await klerosgovernor.sessions(0)
    assert.equal(sessionInfo[0].toNumber(), 2, 'The ruling was set incorrectly')
  })

  it('Should correctly execute transactions in the approved list (atomic execution)', async () => {
    // The first transaction creates a dispute with 11 choices in arbitrator contract.
    // The second one changes withdraw timeout in governor contract to 20.
    // Txs order can be reversed because of hash order requirement.
    let index1
    let index2
    let dataString

    const addresses = [arbitrator.address, klerosgovernor.address]
    const values = ['100000000000000000', 0]
    const data = [101, 36]
    const txHash1 = parseInt(
      soliditySha3(
        arbitrator.address,
        '100000000000000000',
        '0xc13517e1000000000000000000000000000000000000000000000000000000000000000b00000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000001fa'
      ),
      16
    )
    const txHash2 = parseInt(
      soliditySha3(
        klerosgovernor.address,
        0,
        '0x246c76df0000000000000000000000000000000000000000000000000000000000000014'
      ),
      16
    )

    if (txHash1 < txHash2) {
      index1 = 0
      index2 = 1
      dataString =
        '0xc13517e1000000000000000000000000000000000000000000000000000000000000000b00000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000001fa246c76df0000000000000000000000000000000000000000000000000000000000000014'
    } else {
      index1 = 1
      index2 = 0
      dataString =
        '0x246c76df0000000000000000000000000000000000000000000000000000000000000014c13517e1000000000000000000000000000000000000000000000000000000000000000b00000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000001fa'
    }

    await klerosgovernor.submitList(
      [addresses[index1], addresses[index2]],
      [values[index1], values[index2]],
      dataString,
      [data[index1], data[index2]],
      { from: submitter1, value: submissionDeposit }
    )

    // The transaction should not be executed if list is not approved
    await expectThrow(
      klerosgovernor.executeTransactionList(0, 0, 1, { from: general })
    )

    await increaseTime(submissionTimeout + 1)

    await klerosgovernor.executeSubmissions({ from: general })

    // Send spendable money via fallback.
    await klerosgovernor.sendTransaction({ from: other, value: 3e18 })

    assert.equal(
      (await klerosgovernor.expendableFunds()).toNumber(),
      3e18,
      'Incorrect expandableFunds value before execution'
    )

    // Execute the first and the second transactions separately to check atomic execution.
    await klerosgovernor.executeTransactionList(0, 0, 1, { from: general })

    const tx1 = await klerosgovernor.getTransactionInfo(0, 0)
    assert.equal(
      tx1[3],
      true,
      'The first transaction should have status executed'
    )

    let tx2 = await klerosgovernor.getTransactionInfo(0, 1)
    assert.equal(
      tx2[3],
      false,
      'The second transaction should not have status executed'
    )

    await klerosgovernor.executeTransactionList(0, 1, 1, { from: general })

    tx2 = await klerosgovernor.getTransactionInfo(0, 1)
    assert.equal(
      tx2[3],
      true,
      'The second transaction should have status executed'
    )

    const dispute = await arbitrator.disputes(0)
    assert.equal(
      dispute[0],
      klerosgovernor.address,
      'Incorrect arbitrable. First transaction was not executed correctly'
    )
    assert.equal(
      dispute[1].toNumber(),
      11,
      'Incorrect number of choices. First transaction was not executed correctly'
    )
    assert.equal(
      dispute[2].toNumber(),
      1e17,
      'Incorrect fee. First transaction was not executed correctly'
    )

    withdrawTime = await klerosgovernor.withdrawTimeout()
    assert.equal(
      withdrawTime.toNumber(),
      20,
      'The second transaction was not executed correctly'
    )

    assert.equal(
      (await klerosgovernor.expendableFunds()).toNumber(),
      2.9e18,
      'Incorrect expandableFunds value after execution'
    )
  })

  it('Should correctly execute transactions in the approved list (batch execution)', async () => {
    // The first transaction creates a dispute with 11 choices in arbitrator contract.
    // The second one changes withdraw timeout in governor contract to 20.
    // Txs order can be reversed because of hash order requirement.
    let index1
    let index2
    let dataString

    const addresses = [arbitrator.address, klerosgovernor.address]
    const values = ['100000000000000000', 0]
    const data = [101, 36]
    const txHash1 = parseInt(
      soliditySha3(
        arbitrator.address,
        '100000000000000000',
        '0xc13517e1000000000000000000000000000000000000000000000000000000000000000b00000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000001fa'
      ),
      16
    )
    const txHash2 = parseInt(
      soliditySha3(
        klerosgovernor.address,
        0,
        '0x246c76df0000000000000000000000000000000000000000000000000000000000000014'
      ),
      16
    )

    if (txHash1 < txHash2) {
      index1 = 0
      index2 = 1
      dataString =
        '0xc13517e1000000000000000000000000000000000000000000000000000000000000000b00000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000001fa246c76df0000000000000000000000000000000000000000000000000000000000000014'
    } else {
      index1 = 1
      index2 = 0
      dataString =
        '0x246c76df0000000000000000000000000000000000000000000000000000000000000014c13517e1000000000000000000000000000000000000000000000000000000000000000b00000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000001fa'
    }

    await klerosgovernor.submitList(
      [addresses[index1], addresses[index2]],
      [values[index1], values[index2]],
      dataString,
      [data[index1], data[index2]],
      { from: submitter1, value: submissionDeposit }
    )

    await increaseTime(submissionTimeout + 1)

    await klerosgovernor.executeSubmissions({ from: general })

    await klerosgovernor.sendTransaction({ from: other, value: 3e18 })

    await klerosgovernor.executeTransactionList(0, 0, 0, { from: general })

    const dispute = await arbitrator.disputes(0)
    assert.equal(
      dispute[0],
      klerosgovernor.address,
      'Incorrect arbitrable. First transaction was not executed correctly'
    )
    assert.equal(
      dispute[1].toNumber(),
      11,
      'Incorrect number of choices. First transaction was not executed correctly'
    )
    assert.equal(
      dispute[2].toNumber(),
      1e17,
      'Incorrect fee. First transaction was not executed correctly'
    )

    const tx1 = await klerosgovernor.getTransactionInfo(0, 0)
    assert.equal(
      tx1[3],
      true,
      'The first transaction should have status executed'
    )

    const withdrawTime = await klerosgovernor.withdrawTimeout()
    assert.equal(
      withdrawTime.toNumber(),
      20,
      'The second transaction was not executed correctly'
    )

    const tx2 = await klerosgovernor.getTransactionInfo(0, 1)
    assert.equal(
      tx2[3],
      true,
      'The second transaction should have status executed'
    )
  })

  it('Should register payments correctly and withdraw correct fees if dispute had winner/loser', async () => {
    await klerosgovernor.submitList(
      [klerosgovernor.address],
      [10],
      '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
      [36],
      { from: submitter1, value: submissionDeposit }
    )

    await klerosgovernor.submitList([arbitrator.address], [10], '0x2462', [2], {
      from: submitter2,
      value: submissionDeposit
    })

    await klerosgovernor.submitList([], [], '0x24621111', [], {
      from: submitter3,
      value: submissionDeposit
    })

    await increaseTime(submissionTimeout + 1)

    await klerosgovernor.executeSubmissions({ from: general })

    await arbitrator.giveRuling(0, 3)

    const loserAppealFee =
      arbitrationFee + (arbitrationFee * loserMultiplier) / MULTIPLIER_DIVISOR

    const winnerAppealFee =
      arbitrationFee + (arbitrationFee * winnerMultiplier) / MULTIPLIER_DIVISOR

    await klerosgovernor.fundAppeal(0, {
      from: submitter1,
      value: loserAppealFee
    })

    // Deliberately underpay with 2nd loser to check correct fee distribution.
    await klerosgovernor.fundAppeal(1, {
      from: submitter2,
      value: arbitrationFee
    })

    // Winner's fee is crowdfunded.
    await klerosgovernor.fundAppeal(2, {
      from: other,
      value: winnerAppealFee * 0.75
    })

    await klerosgovernor.fundAppeal(2, {
      from: submitter3,
      value: 1e18
    })

    // Check that it's not possible to withdraw fees if dispute is unresolved.
    await expectThrow(
      klerosgovernor.withdrawFeesAndRewards(submitter1, 0, 0, 0, 0, {
        from: general
      })
    )

    // Check that contract registers paid fees correctly.
    const roundInfo = await klerosgovernor.getRoundInfo(0, 0)
    assert.equal(
      roundInfo[0][0].toNumber(),
      loserAppealFee,
      'Registered fee of the first loser is incorrect'
    )
    assert.equal(
      roundInfo[1][0],
      true,
      'Did not register that first loser successfully paid his fees'
    )
    assert.equal(
      roundInfo[0][1].toNumber(),
      arbitrationFee,
      'Registered fee of the second loser is incorrect'
    )
    assert.equal(
      roundInfo[1][1],
      false,
      'Should not register that second loser successfully paid his fees'
    )
    assert.equal(
      roundInfo[0][2].toNumber(),
      winnerAppealFee,
      'Registered fee of the winner is incorrect'
    )
    assert.equal(
      roundInfo[1][2],
      true,
      'Did not register that the winner successfully paid his fees'
    )
    assert.equal(
      roundInfo[2].toNumber(),
      winnerAppealFee + loserAppealFee - arbitrationFee,
      'Incorrect fee rewards value'
    )
    assert.equal(
      roundInfo[3].toNumber(),
      winnerAppealFee + loserAppealFee,
      'Incorrect successfully paid fees value'
    )

    await arbitrator.giveRuling(1, 3)

    // 2nd loser underpays again in the last round.
    await klerosgovernor.fundAppeal(1, {
      from: submitter2,
      value: loserAppealFee - 1000
    })

    await increaseTime(appealTimeout + 1)
    await arbitrator.giveRuling(1, 3)

    const oldBalance1 = await web3.eth.getBalance(submitter1)
    await klerosgovernor.withdrawFeesAndRewards(submitter1, 0, 0, 0, 0, {
      from: general
    })
    const newBalance1 = await web3.eth.getBalance(submitter1)
    assert.equal(
      newBalance1.toString(),
      oldBalance1.toString(),
      'Balance of the first loser should stay the same'
    )
    const oldBalance2 = await web3.eth.getBalance(submitter2)
    await klerosgovernor.withdrawFeesAndRewards(submitter2, 0, 0, 0, 0, {
      from: general
    })
    let newBalance2 = await web3.eth.getBalance(submitter2)
    assert.equal(
      newBalance2.toString(),
      oldBalance2.toString(),
      'Balance of the second loser should stay the same after withdrawing fees of the first round'
    )
    await klerosgovernor.withdrawFeesAndRewards(submitter2, 0, 1, 0, 0, {
      from: general
    })
    newBalance2 = await web3.eth.getBalance(submitter2)
    assert.equal(
      newBalance2.toString(),
      oldBalance2
        .plus(loserAppealFee)
        .minus(1000)
        .toString(),
      'Second loser should be reimbursed what he paid in the last round'
    )

    const oldBalance3 = await web3.eth.getBalance(submitter3)
    await klerosgovernor.withdrawFeesAndRewards(submitter3, 0, 0, 0, 0, {
      from: general
    })
    const newBalance3 = await web3.eth.getBalance(submitter3) // winner
    assert.equal(
      newBalance3.toString(),
      oldBalance3.plus(0.25 * roundInfo[2]).toString(),
      'Incorrect balance of the first crowdfunder after funding winning list'
    )
    const oldBalance4 = await web3.eth.getBalance(other)
    await klerosgovernor.withdrawFeesAndRewards(other, 0, 0, 0, 0, {
      from: general
    })
    const newBalance4 = await web3.eth.getBalance(other)
    assert.equal(
      newBalance4.toString(),
      oldBalance4.plus(0.75 * roundInfo[2]).toString(),
      'Incorrect balance of the second crowdfunder after funding winning list'
    )
  })

  it('Should withdraw correct fees if arbitrator refused to arbitrate', async () => {
    await klerosgovernor.submitList(
      [klerosgovernor.address],
      [10],
      '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
      [36],
      { from: submitter1, value: submissionDeposit }
    )

    await klerosgovernor.submitList([arbitrator.address], [10], '0x2462', [2], {
      from: submitter2,
      value: submissionDeposit
    })

    await klerosgovernor.submitList([], [], '0x24621111', [], {
      from: submitter3,
      value: submissionDeposit
    })

    await increaseTime(submissionTimeout + 1)

    await klerosgovernor.executeSubmissions({ from: general })

    await arbitrator.giveRuling(0, 0)

    const sharedAppealFee =
      arbitrationFee + (arbitrationFee * sharedMultiplier) / MULTIPLIER_DIVISOR

    await klerosgovernor.fundAppeal(0, {
      from: other,
      value: sharedAppealFee * 0.2
    })

    await klerosgovernor.fundAppeal(0, {
      from: submitter1,
      value: 5e18
    })

    // Deliberately underpay with 3rd submitter.
    await klerosgovernor.fundAppeal(2, {
      from: submitter3,
      value: sharedAppealFee * 0.3
    })

    await klerosgovernor.fundAppeal(1, {
      from: other,
      value: sharedAppealFee * 0.4
    })

    await klerosgovernor.fundAppeal(1, {
      from: submitter2,
      value: 2e18
    })

    const roundInfo = await klerosgovernor.getRoundInfo(0, 0)

    await arbitrator.giveRuling(1, 0)
    await increaseTime(appealTimeout + 1)
    await arbitrator.giveRuling(1, 0)

    const oldBalance1 = await web3.eth.getBalance(submitter1)
    await klerosgovernor.withdrawFeesAndRewards(submitter1, 0, 0, 0, 0, {
      from: general
    })
    const newBalance1 = await web3.eth.getBalance(submitter1)
    assert.equal(
      newBalance1.toString(),
      oldBalance1.plus(0.4 * roundInfo[2]).toString(),
      'Incorrect balance of the first submitter'
    )
    const oldBalance2 = await web3.eth.getBalance(submitter2)
    await klerosgovernor.withdrawFeesAndRewards(submitter2, 0, 0, 0, 0, {
      from: general
    })
    const newBalance2 = await web3.eth.getBalance(submitter2)
    assert.equal(
      newBalance2.toString(),
      oldBalance2.plus(0.3 * roundInfo[2]).toString(),
      'Incorrect balance of the second submitter'
    )

    const oldBalance3 = await web3.eth.getBalance(submitter3)
    await klerosgovernor.withdrawFeesAndRewards(submitter3, 0, 0, 0, 0, {
      from: general
    })
    const newBalance3 = await web3.eth.getBalance(submitter3)
    assert.equal(
      newBalance3.toString(),
      oldBalance3
        .plus(0.2 * sharedAppealFee) // Third submitter is reimbursed the value of feeRewards/successfullyPaid * contribution: 2/3 * 0.3 * sharedAppealFee
        .toString(),
      'Incorrect balance of the 3rd submitter'
    )
    const oldBalance4 = await web3.eth.getBalance(other)
    await klerosgovernor.withdrawFeesAndRewards(other, 0, 0, 0, 0, {
      from: general
    })
    const newBalance4 = await web3.eth.getBalance(other)
    assert.equal(
      newBalance4.toString(),
      oldBalance4.plus(0.3 * roundInfo[2]).toString(),
      'Incorrect balance of the crowdfunder'
    )
  })
})
