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
  const submissionDeposit = 1e18
  const submissionTimeout = 3600
  const withdrawTimeout = 100
  const sharedMultiplier = 5000
  const winnerMultiplier = 3000
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
    assert.equal((await klerosgovernor.winnerMultiplier()).toNumber(), 3000)
    assert.equal((await klerosgovernor.loserMultiplier()).toNumber(), 7000)
    assert.equal(await klerosgovernor.governor(), klerosgovernor.address)
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
    // Should fail if arrays are not the same length
    await expectThrow(
      klerosgovernor.submitList(
        [klerosgovernor.address, arbitrator.address],
        [10],
        '0x246c76df0000000000000000000000000000000000000000000000000000000000000014953d6651000000000000000000000000000000000000000000000000000000000000fb',
        [36, 35],
        { from: submitter1, value: submissionDeposit }
      )
    )
    await expectThrow(
      klerosgovernor.submitList(
        [klerosgovernor.address, arbitrator.address],
        [10, 1e17],
        '0x246c76df0000000000000000000000000000000000000000000000000000000000000014953d6651000000000000000000000000000000000000000000000000000000000000fb',
        [71],
        { from: submitter1, value: submissionDeposit }
      )
    )
    await expectThrow(
      klerosgovernor.submitList(
        [klerosgovernor.address],
        [10, 1e17],
        '0x246c76df0000000000000000000000000000000000000000000000000000000000000014953d6651000000000000000000000000000000000000000000000000000000000000fb',
        [36, 35],
        { from: submitter1, value: submissionDeposit }
      )
    )

    // Should fail when submitting less
    await expectThrow(
      klerosgovernor.submitList(
        [klerosgovernor.address, arbitrator.address],
        [10, 1e17],
        '0x246c76df0000000000000000000000000000000000000000000000000000000000000014953d6651000000000000000000000000000000000000000000000000000000000000fb',
        [36, 35],
        { from: submitter1, value: submissionDeposit - 1000 }
      )
    )

    await klerosgovernor.submitList(
      [klerosgovernor.address, arbitrator.address],
      [10, 1e17],
      '0x246c76df0000000000000000000000000000000000000000000000000000000000000014953d6651000000000000000000000000000000000000000000000000000000000000fb',
      [36, 35],
      { from: submitter1, value: submissionDeposit }
    )

    const txList = await klerosgovernor.txLists(0)

    assert.equal(txList[0], submitter1, 'The sender of the list is incorrect')
    assert.equal(
      txList[1].toNumber(),
      1e18,
      'The deposit of the list is incorrect'
    )
    const txListLength = await klerosgovernor.getNumberOfTransactions(0)
    assert.equal(
      txListLength.toNumber(),
      2,
      'The number of transactions is incorrect'
    )
    const tx1 = await klerosgovernor.getTransactionInfo(0, 0)
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

    const tx2 = await klerosgovernor.getTransactionInfo(0, 1)
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
    const txHash1 = soliditySha3(tx1[0], tx1[1], tx1[2])
    const txHash2 = soliditySha3(tx2[0], tx2[1], tx2[2])
    const txHash = soliditySha3(txHash2, txHash1)
    assert.equal(txList[2], txHash, 'The list hash is incorrect')

    await increaseTime(submissionTimeout + 1)
    // Shouldn't be possible to submit after submission timeout
    await expectThrow(
      klerosgovernor.submitList(
        [klerosgovernor.address, arbitrator.address],
        [180, 1e17],
        '0xfdeaa24eb3',
        [2, 3],
        { from: submitter2, value: submissionDeposit }
      )
    )
  })

  it('Should correctly withdraw submitted list', async () => {
    await klerosgovernor.submitList(
      [klerosgovernor.address, arbitrator.address],
      [10, 1e17],
      '0xfdeaa24eb3',
      [2, 3],
      { from: submitter1, value: submissionDeposit }
    )

    await klerosgovernor.submitList(
      [klerosgovernor.address],
      [10],
      '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
      [36],
      { from: submitter2, value: submissionDeposit }
    )

    let submissionCount = await klerosgovernor.getNumberOfSubmittedLists()
    assert.equal(
      submissionCount.toNumber(),
      2,
      'The submission count is incorrect'
    )
    let sumDeposit = await klerosgovernor.sumDeposit()
    assert.equal(
      sumDeposit.toNumber(),
      2e18,
      'The sum of submission deposits is incorrect'
    )
    const oldBalance = await web3.eth.getBalance(submitter2)

    // Shouldn't be possible to withdraw someone else's list
    await expectThrow(
      klerosgovernor.withdrawTransactionList(1, { from: submitter1 })
    )
    const tx = await klerosgovernor.withdrawTransactionList(1, {
      from: submitter2,
      gasPrice: gasPrice
    })
    const txFee = tx.receipt.gasUsed * gasPrice

    submissionCount = await klerosgovernor.getNumberOfSubmittedLists()
    assert.equal(
      submissionCount.toNumber(),
      1,
      'The submission count after withdrawal is incorrect'
    )
    sumDeposit = await klerosgovernor.sumDeposit()
    assert.equal(
      sumDeposit.toNumber(),
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
    // Shouldn't be possible to withdraw after timeout
    await expectThrow(
      klerosgovernor.withdrawTransactionList(0, { from: submitter1 })
    )
  })

  it('Should switch to approval period if no lists were submitted', async () => {
    // Shouldn't be possible to switch to approval period before timeout
    await expectThrow(klerosgovernor.approveTransactionList({ from: general }))

    await increaseTime(submissionTimeout + 1)
    await klerosgovernor.approveTransactionList({ from: general })

    // Check that submissions are working in the new submitting session
    await klerosgovernor.submitList(
      [klerosgovernor.address, arbitrator.address],
      [10, 1e17],
      '0xfdeaa24eb3',
      [2, 3],
      { from: submitter1, value: submissionDeposit }
    )

    const submissionCount = await klerosgovernor.getNumberOfSubmittedLists()
    assert.equal(
      submissionCount.toNumber(),
      1,
      'The submission count in the new session is incorrect'
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

    await klerosgovernor.approveTransactionList({ from: general })
    const newBalance = await web3.eth.getBalance(submitter1)

    const txList = await klerosgovernor.txLists(0)
    assert.equal(txList[4], true, 'The list should be approved')
    assert.equal(
      newBalance.toString(),
      oldBalance.plus(1e18).toString(),
      'Incorrect submitter balance after approval'
    )

    let submissionCount = await klerosgovernor.getNumberOfSubmittedLists()
    assert.equal(
      submissionCount.toNumber(),
      0,
      'The submission count should be set to 0 right after approval'
    )

    let sumDeposit = await klerosgovernor.sumDeposit()
    assert.equal(
      sumDeposit.toNumber(),
      0,
      'The sum of the deposits should be set to 0 right after approval'
    )

    // Check that submissions are working in the new submitting session
    await klerosgovernor.submitList([], [], '', [], {
      from: submitter2,
      value: submissionDeposit
    })

    submissionCount = await klerosgovernor.getNumberOfSubmittedLists()
    assert.equal(
      submissionCount.toNumber(),
      1,
      'The submission count in the new session is incorrect'
    )

    sumDeposit = await klerosgovernor.sumDeposit()
    assert.equal(
      sumDeposit.toNumber(),
      1e18,
      'The sum of the deposits in the new session is incorrect'
    )

    const numberOfLists = await klerosgovernor.getNumberOfCreatedLists()
    assert.equal(
      numberOfLists.toNumber(),
      2,
      'The number of created lists is incorrect'
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
    const oldSumDeposit = await klerosgovernor.sumDeposit()

    await klerosgovernor.approveTransactionList({ from: general })

    const newSumDeposit = await klerosgovernor.sumDeposit()

    assert.equal(
      oldSumDeposit.toNumber() - 1e17,
      newSumDeposit.toNumber(),
      'The sum of the deposits after dispute creation is incorrect'
    )

    const lastAction = await klerosgovernor.lastAction()
    assert.equal(
      lastAction.toNumber(),
      0,
      'Incorrect last action value after dispute creation'
    )

    const status = await klerosgovernor.status()
    assert.equal(
      status.toNumber(),
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
    await expectThrow(klerosgovernor.approveTransactionList({ from: general }))
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

    await klerosgovernor.approveTransactionList({ from: general })

    let sumDeposit = await klerosgovernor.sumDeposit()

    await arbitrator.giveRuling(0, 1)
    await increaseTime(appealTimeout + 1)

    const oldBalance1 = await web3.eth.getBalance(submitter1)
    const oldBalance2 = await web3.eth.getBalance(submitter2)
    const oldBalance3 = await web3.eth.getBalance(submitter3)

    await arbitrator.giveRuling(0, 1)

    const newBalance1 = await web3.eth.getBalance(submitter1)
    const newBalance2 = await web3.eth.getBalance(submitter2)
    const newBalance3 = await web3.eth.getBalance(submitter3)

    // The winner should be sent sum of deposits of losing sides minus arbitration fees.
    // In sumDeposit fees are already subtracted, we only need to subtract the deposit of the winner party.
    assert.equal(
      newBalance1.toString(),
      oldBalance1
        .plus(sumDeposit)
        .minus(submissionDeposit)
        .toString(),
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

    const txList = await klerosgovernor.txLists(0)

    assert.equal(txList[4], true, 'The winning list should be approved')

    const submissionCount = await klerosgovernor.getNumberOfSubmittedLists()
    assert.equal(
      submissionCount.toNumber(),
      0,
      'The submission count should be set to 0 after ruling was given'
    )

    sumDeposit = await klerosgovernor.sumDeposit()
    assert.equal(
      sumDeposit.toNumber(),
      0,
      'The sum of the deposits should be set to 0 right after ruling was given'
    )

    const status = await klerosgovernor.status()
    assert.equal(
      status.toNumber(),
      0,
      'Incorrect status after dispute was resolved'
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

    await klerosgovernor.approveTransactionList({ from: general })

    // Ruling 1 is equal to 0 submission index (submitter1)/
    await arbitrator.giveRuling(0, 1)
    // appeal fee is the same as arbitration fee for this arbitrator
    const loserAppealFee =
      arbitrationFee + (arbitrationFee * loserMultiplier) / MULTIPLIER_DIVISOR
    // Should fail if paid less.
    await expectThrow(
      klerosgovernor.fundAppeal(1, {
        from: submitter2,
        value: loserAppealFee - 1000
      })
    )
    // Should fail in attempt to fund someone else's side
    await expectThrow(
      klerosgovernor.fundAppeal(2, {
        from: submitter2,
        value: loserAppealFee
      })
    )
    await klerosgovernor.fundAppeal(1, {
      from: submitter2,
      value: loserAppealFee
    })

    // Check that it's not possible to fund appeal twice in the same round
    await expectThrow(
      klerosgovernor.fundAppeal(1, { from: submitter2, value: loserAppealFee })
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

    // Should fail if paid less.
    await expectThrow(
      klerosgovernor.fundAppeal(0, {
        from: submitter1,
        value: winnerAppealFee - 1000
      })
    )

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

    // Winner should be rewarded with submission deposits of 2 losing parties minus arbitration/appeal fees.
    assert.equal(
      newBalance1.toString(),
      oldBalance1.toString(),
      'Incorrect balance of the first losing party afet appealed ruling'
    )
    assert.equal(
      newBalance2.toString(),
      oldBalance2
        .plus(2e18 + loserAppealFee + winnerAppealFee)
        .minus(2e17)
        .toString(),
      'Incorrect balance of the winning party after appealed ruling'
    )
    assert.equal(
      newBalance3.toString(),
      oldBalance3.toString(),
      'Incorrect balance of the second losing party afet appealed ruling'
    )
    const txList = await klerosgovernor.txLists(1)
    assert.equal(txList[4], true, 'The winning list should be approved')
  })

  it('Should change the ruling if the winner had a duplicate with lesser submission time', async () => {
    await klerosgovernor.submitList(
      [klerosgovernor.address],
      [10],
      '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
      [36],
      { from: submitter1, value: submissionDeposit }
    )

    await increaseTime(5)

    await klerosgovernor.submitList(
      [klerosgovernor.address],
      [10],
      '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
      [36],
      { from: submitter2, value: submissionDeposit }
    )

    await increaseTime(submissionTimeout + 1)

    await klerosgovernor.approveTransactionList({ from: general })
    // The second list (submission index 1) was submitted later and should lose despite ruling being in its favor.
    await arbitrator.giveRuling(0, 2)
    await increaseTime(appealTimeout + 1)
    await arbitrator.giveRuling(0, 2)

    const winningList = await klerosgovernor.txLists(0)
    assert.equal(winningList[4], true, 'The winning list should be approved')
    const losingList = await klerosgovernor.txLists(1)
    assert.equal(
      losingList[4],
      false,
      'The second submitted list should not be approved'
    )
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

    await klerosgovernor.approveTransactionList({ from: general })
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

    const losingList = await klerosgovernor.txLists(0)
    assert.equal(
      losingList[4],
      false,
      'The first list should not be approved because it did not pay appeal fees'
    )
    const winningList = await klerosgovernor.txLists(1)
    assert.equal(winningList[4], true, 'The second list should be approved')
  })

  it('Should correctly execute transactions in the approved list (atomic execution)', async () => {
    // The first transaction creates a dispute with 11 choices in arbitrator contract.
    // The second one changes withdraw timeout in governor contract to 20.
    await klerosgovernor.submitList(
      [arbitrator.address, klerosgovernor.address],
      ['100000000000000000', 0],
      '0xc13517e1000000000000000000000000000000000000000000000000000000000000000b00000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000001fa246c76df0000000000000000000000000000000000000000000000000000000000000014',
      [101, 36],
      { from: submitter1, value: submissionDeposit }
    )

    // The transaction should not be executed if list is not approved
    await expectThrow(
      klerosgovernor.executeTransactionList(0, 0, 1, { from: general })
    )

    await increaseTime(submissionTimeout + 1)

    await klerosgovernor.approveTransactionList({ from: general })

    // Submit a list so the contract has enough balance for execution
    await klerosgovernor.submitList([], [], '', [], {
      from: general,
      value: submissionDeposit
    })

    // Execute the first and the second transactions separately to check atomic execution.
    await klerosgovernor.executeTransactionList(0, 0, 1, { from: general })

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

    // Before executing second transaction check that withdraw timeout is still a default value.
    let withdrawTime = await klerosgovernor.withdrawTimeout()
    assert.equal(
      withdrawTime.toNumber(),
      100,
      'WithdrawTimeout before execution is incorrect'
    )

    await klerosgovernor.executeTransactionList(0, 1, 1, { from: general })

    withdrawTime = await klerosgovernor.withdrawTimeout()
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

  it('Should correctly execute transactions in the approved list (batch execution)', async () => {
    // The first transaction creates a dispute with 11 choices in arbitrator contract.
    // The second one changes withdraw timeout in governor contract to 20.
    await klerosgovernor.submitList(
      [arbitrator.address, klerosgovernor.address],
      ['100000000000000000', 0],
      '0xc13517e1000000000000000000000000000000000000000000000000000000000000000b00000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000001fa246c76df0000000000000000000000000000000000000000000000000000000000000014',
      [101, 36],
      { from: submitter1, value: submissionDeposit }
    )

    await increaseTime(submissionTimeout + 1)

    await klerosgovernor.approveTransactionList({ from: general })

    // Submit a list so the contract has enough balance for execution
    await klerosgovernor.submitList([], [], '', [], {
      from: general,
      value: submissionDeposit
    })

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
})
