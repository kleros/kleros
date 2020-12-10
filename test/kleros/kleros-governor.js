/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.
const { soliditySha3 } = require('web3-utils')
const { expectRevert, time } = require('@openzeppelin/test-helpers')

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
  const executionTimeout = 3000 // 50 min
  const submissionTimeout = 3600 // 1 hour
  const withdrawTimeout = 100 // 1 min 40 sec
  const sharedMultiplier = 5000 // 50%
  const winnerMultiplier = 2000 // 20%
  const loserMultiplier = 7000 // 70%
  // MULTIPLIER_DIVISOR = 10000 = 100%
  const appealTimeout = 1200 // 20 min
  const arbitratorExtraData = 0x85
  const metaEvidenceURI = 'https://metaevidence.io'
  const arbitrationFee = web3.utils.toBN(0.1e18) // 0.1 ETH
  const submissionBaseDeposit = web3.utils.toBN(0.9e18) // 0.9 ETH
  // submissionDeposit = 1e18 = 1 ETH, submissionBaseDeposit + arbitrationFee

  const gasPrice = 5000000000 // 5 Gwei

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
      submissionBaseDeposit,
      submissionTimeout,
      executionTimeout,
      withdrawTimeout,
      sharedMultiplier,
      winnerMultiplier,
      loserMultiplier,
      { from: general }
    )

    await klerosgovernor.setMetaEvidence(metaEvidenceURI, { from: general })
  })

  it('Should set correct values in constructor', async () => {
    expect(await klerosgovernor.arbitrator()).to.equal(arbitrator.address)
    expect(await klerosgovernor.arbitratorExtraData()).to.equal('0x85')
    expect(await klerosgovernor.submissionTimeout()).to.deep.equal(
      web3.utils.toBN(3600)
    )
    expect(await klerosgovernor.executionTimeout()).to.deep.equal(
      web3.utils.toBN(3000)
    )
    expect(await klerosgovernor.withdrawTimeout()).to.deep.equal(
      web3.utils.toBN(100)
    )
    expect(await klerosgovernor.sharedMultiplier()).to.deep.equal(
      web3.utils.toBN(5000)
    )
    expect(await klerosgovernor.winnerMultiplier()).to.deep.equal(
      web3.utils.toBN(2000)
    )
    expect(await klerosgovernor.loserMultiplier()).to.deep.equal(
      web3.utils.toBN(7000)
    )
    expect(await klerosgovernor.getCurrentSessionNumber()).to.deep.equal(
      web3.utils.toBN(0)
    )
    expect(await klerosgovernor.submissionBaseDeposit()).to.deep.equal(
      web3.utils.toBN(9e17)
    )
  })

  it('Only governor should be allowed to change contract parameters', async () => {
    await expectRevert(
      klerosgovernor.changeSubmissionDeposit(20, { from: general }),
      'Only the governor can execute this.'
    )
    await expectRevert(
      klerosgovernor.changeSubmissionTimeout(51, { from: submitter1 }),
      'Only the governor can execute this.'
    )
    await expectRevert(
      klerosgovernor.changeExecutionTimeout(5, { from: submitter1 }),
      'Only the governor can execute this.'
    )
    await expectRevert(
      klerosgovernor.changeWithdrawTimeout(23, { from: submitter2 }),
      'Only the governor can execute this.'
    )
    await expectRevert(
      klerosgovernor.changeSharedMultiplier(200, { from: general }),
      'Only the governor can execute this.'
    )
    await expectRevert(
      klerosgovernor.changeWinnerMultiplier(250, { from: submitter1 }),
      'Only the governor can execute this.'
    )
    await expectRevert(
      klerosgovernor.changeLoserMultiplier(330, { from: submitter2 }),
      'Only the governor can execute this.'
    )

    const arbitrator2 = await Arbitrator.new(
      arbitrationFee,
      general,
      arbitratorExtraData,
      appealTimeout,
      { from: general }
    )

    await expectRevert(
      klerosgovernor.changeArbitrator(
        arbitrator2.address,
        arbitratorExtraData,
        { from: submitter2 }
      ),
      'Only the governor can execute this.'
    )
  })

  it('Should set correct values in a newly submitted list and fire the event', async () => {
    // Should fail if arrays are not the same length. We check between arrays having 0 and 1 length so we don't have to deal with tx order requirement.
    await expectRevert(
      klerosgovernor.submitList(
        [klerosgovernor.address],
        [],
        '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
        [36],
        'Value array',
        { from: submitter1, value: 1e18 }
      ),
      'Incorrect input. Target and value arrays must be of the same length.'
    )
    await expectRevert(
      klerosgovernor.submitList(
        [],
        [web3.utils.toBN(1e17)],
        '0x246c76df0000000000000000000000000000000000000000000000000000000000000014953d6651000000000000000000000000000000000000000000000000000000000000fb',
        [71],
        'Target array',
        { from: submitter1, value: 1e18 }
      ),
      'Incorrect input. Target and value arrays must be of the same length.'
    )
    await expectRevert(
      klerosgovernor.submitList(
        [klerosgovernor.address],
        [10],
        '0x246c76df0000000000000000000000000000000000000000000000000000000000000014953d6651000000000000000000000000000000000000000000000000000000000000fb',
        [],
        'Data size array',
        { from: submitter1, value: 1e18 }
      ),
      'Incorrect input. Target and datasize arrays must be of the same length.'
    )

    // Should fail when submitting less
    await expectRevert(
      klerosgovernor.submitList(
        [klerosgovernor.address],
        [10],
        '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
        [36],
        'Transaction value too small',
        { from: submitter1, value: '999999999999999999' } // 1 ETH - 1 wei
      ),
      'Submission deposit must be paid in full.'
    )

    const addresses = [
      '0x0123456789aBcdef0123456789abcdEF02468AcE',
      '0xeca86420feDcBa9876543210FEdcba9876543210'
    ]

    const submissionTx = await klerosgovernor.submitList(
      [addresses[0], addresses[1]],
      [web3.utils.toBN(10), web3.utils.toBN(0.1e18)],
      '0x246c76df0000000000000000000000000000000000000000000000000000000000000014953d6651000000000000000000000000000000000000000000000000000000000000fb',
      [36, 35],
      'Normal submission',
      { from: submitter1, value: 1.1e18 } // Overdeposit to test refund
    )

    const submission = await klerosgovernor.submissions(0)

    expect(submissionTx.logs[0].event).to.equal('ListSubmitted') // The event has not been created
    expect(submissionTx.logs[0].args._listID).to.deep.equal(web3.utils.toBN(0)) // The event has wrong list ID
    expect(submissionTx.logs[0].args._submitter).to.equal(submitter1) // The event has wrong submitter
    expect(submissionTx.logs[0].args._description).to.equal('Normal submission') // The event has wrong list description
    expect(submissionTx.logs[0].args._session).to.deep.equal(web3.utils.toBN(0)) // The event has wrong session number
    expect(submission[0]).to.equal(submitter1) // The sender of the list is incorrect
    expect(submission[1]).to.deep.equal(web3.utils.toBN(1e18)) // The deposit of the list is incorrect

    const submissionLength = await klerosgovernor.getNumberOfTransactions(0)
    expect(submissionLength).to.deep.equal(web3.utils.toBN(2)) // The number of transactions is incorrect

    const tx1 = await klerosgovernor.getTransactionInfo(0, 0)
    expect(tx1[0]).to.equal(addresses[0]) // The target of the first transaction is incorrect
    expect(tx1[1]).to.deep.equal(web3.utils.toBN(10)) // The value of the first transaction is incorrect
    expect(tx1[2]).to.equal(
      '0x246c76df0000000000000000000000000000000000000000000000000000000000000014'
    ) // The data of the first transaction is incorrect

    const tx2 = await klerosgovernor.getTransactionInfo(0, 1)
    expect(tx2[0]).to.equal(addresses[1]) // The target of the second transaction is incorrect
    expect(tx2[1]).to.deep.equal(web3.utils.toBN(0.1e18)) // The value of the second transaction is incorrect
    expect(tx2[2]).to.equal(
      '0x953d6651000000000000000000000000000000000000000000000000000000000000fb'
    ) // The data of the second transaction is incorrect

    const hash1 = soliditySha3(
      soliditySha3(
        addresses[0],
        10,
        '0x246c76df0000000000000000000000000000000000000000000000000000000000000014'
      ),
      0
    )
    const hash2 = soliditySha3(
      addresses[1],
      web3.utils.toBN(0.1e18),
      '0x953d6651000000000000000000000000000000000000000000000000000000000000fb'
    )
    const listHash = soliditySha3(hash2, hash1)
    expect(submission[2]).to.equal(listHash) // The list hash is incorrect

    await time.increase(submissionTimeout + 1)
    // Shouldn't be possible to submit after submission timeout
    await expectRevert(
      klerosgovernor.submitList(
        [klerosgovernor.address],
        [180],
        '0xfdea',
        [2],
        'Submission timeout',
        { from: submitter2, value: 1e18 }
      ),
      'Submission time has ended.'
    )
  })

  it('Should not allow to submit a list in the wrong order', async () => {
    const addresses = [
      '0x0123456789aBcdef0123456789abcdEF02468AcE',
      '0xeca86420feDcBa9876543210FEdcba9876543210'
    ]

    await expectRevert(
      klerosgovernor.submitList(
        [addresses[1], addresses[0]],
        [web3.utils.toBN(0.1e18), web3.utils.toBN(10)],
        '0x953d6651000000000000000000000000000000000000000000000000000000000000fb246c76df0000000000000000000000000000000000000000000000000000000000000014',
        [35, 36],
        'Wrong order submission',
        { from: submitter1, value: 1.1e18 } // Overdeposit to test refund
      ),
      'The transactions are in incorrect order.'
    )
  })

  it('Should not allow to submit a duplicate list', async () => {
    await klerosgovernor.submitList(
      [klerosgovernor.address],
      [10],
      '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
      [36],
      'Original list',
      { from: submitter1, value: 1e18 }
    )
    // Check the case with the same and with different submitters.
    await expectRevert(
      klerosgovernor.submitList(
        [klerosgovernor.address],
        [10],
        '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
        [36],
        'Duplicate list with same submitter',
        { from: submitter1, value: 1e18 }
      ),
      'The same list was already submitted earlier.'
    )

    await expectRevert(
      klerosgovernor.submitList(
        [klerosgovernor.address],
        [10],
        '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
        [36],
        'Duplicate list with different submitter',
        { from: submitter2, value: 1e18 }
      ),
      'The same list was already submitted earlier.'
    )
  })

  it('Should correctly withdraw submitted list', async () => {
    // Withdraw timeout is 100.
    expect(await klerosgovernor.withdrawTimeout()).to.deep.equal(
      web3.utils.toBN(100)
    ) // Withdraw timeout is incorrect

    await klerosgovernor.submitList(
      [klerosgovernor.address],
      [10],
      '0xfdea',
      [2],
      'List 1',
      { from: submitter1, value: 1e18 }
    )

    await klerosgovernor.submitList(
      [klerosgovernor.address],
      [10],
      '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
      [36],
      'List 2',
      { from: submitter2, value: 1e18 }
    )

    let submittedLists = await klerosgovernor.getSubmittedLists(0)
    expect(submittedLists.length).to.equal(2) // The submission count is incorrect
    let sessionInfo = await klerosgovernor.sessions(0)
    expect(sessionInfo[2]).to.deep.equal(web3.utils.toBN(2e18)) // The sum of submission deposits is incorrect

    const oldBalance = await web3.eth.getBalance(submitter2)

    const list2Info = await klerosgovernor.submissions(1)
    const list2Hash = await list2Info[2]

    // Shouldn't be possible to withdraw someone else's list
    await expectRevert(
      klerosgovernor.withdrawTransactionList(1, list2Hash, {
        from: submitter1
      }),
      "Can't withdraw the list created by someone else."
    )
    const tx = await klerosgovernor.withdrawTransactionList(1, list2Hash, {
      from: submitter2,
      gasPrice: gasPrice
    })
    const txFee = tx.receipt.gasUsed * gasPrice

    submittedLists = await klerosgovernor.getSubmittedLists(0)
    expect(submittedLists.length).to.equal(1) // The submission count after withdrawal is incorrect

    sessionInfo = await klerosgovernor.sessions(0)
    expect(sessionInfo[2]).to.deep.equal(web3.utils.toBN(1e18)) // The sum of submission deposits after withdrawal is incorrect

    const newBalance = await web3.eth.getBalance(submitter2)
    expect(web3.utils.toBN(newBalance).toString()).to.equal(
      web3.utils
        .toBN(oldBalance)
        .add(web3.utils.toBN(1e18))
        .sub(web3.utils.toBN(txFee))
        .toString()
    ) // Incorrect balance after withdrawal

    await time.increase(101)
    const list1Info = await klerosgovernor.submissions(0)
    const list1Hash = await list1Info[2]
    // Shouldn't be possible to withdraw after timeout
    await expectRevert(
      klerosgovernor.withdrawTransactionList(0, list1Hash, {
        from: submitter1
      }),
      'Withdrawing time has passed.'
    )
  })

  it('Should not be possible to withdraw in the 2nd half of the submission period', async () => {
    expect(await klerosgovernor.submissionTimeout()).to.deep.equal(
      web3.utils.toBN(3600)
    ) // Submission timeout is 3600
    expect(await klerosgovernor.withdrawTimeout()).to.deep.equal(
      web3.utils.toBN(100)
    ) // Withdraw timeout is 100

    // Increase time in such way to check that the call throws because of the submission timeout, and not because of withdraw timeout.
    await time.increase(1790)
    await klerosgovernor.submitList(
      [klerosgovernor.address],
      [10],
      '0xfdea',
      [2],
      'Normal submission',
      { from: submitter1, value: 1e18 }
    )

    await time.increase(11) // Go to 2nd half of the submission period
    const listInfo = await klerosgovernor.submissions(0)
    const listHash = await listInfo[2]
    await expectRevert(
      klerosgovernor.withdrawTransactionList(0, listHash, { from: submitter1 }),
      'Lists can be withdrawn only in the first half of the period.'
    )
  })

  it('Should switch to approval period if no lists were submitted', async () => {
    // Submission timeout is 3600.
    expect(await klerosgovernor.submissionTimeout()).to.deep.equal(
      web3.utils.toBN(3600)
    ) // Submission timeout is 3600

    // Shouldn't be possible to switch to approval period before timeout
    await expectRevert(
      klerosgovernor.executeSubmissions({ from: general }),
      'Approval time has not started yet.'
    )

    await time.increase(3601) // After submission timeout
    await klerosgovernor.executeSubmissions({ from: general })

    expect(await klerosgovernor.getCurrentSessionNumber()).to.deep.equal(
      web3.utils.toBN(1)
    )
    // Check that submissions are working in the new submitting session
    await klerosgovernor.submitList(
      [klerosgovernor.address],
      [10],
      '0xfdea',
      [2],
      "New session's list",
      { from: submitter1, value: 1e18 }
    )

    const submittedLists = await klerosgovernor.getSubmittedLists(1)
    expect(submittedLists.length).to.equal(1) // The submission count in the new session is incorrect

    const sessionInfo = await klerosgovernor.sessions(0)
    expect(sessionInfo[3]).to.deep.equal(web3.utils.toBN(2)) // Previous session should have status resolved
  })

  it('Should approve a list if there is only one submission and change period', async () => {
    // Submission timeout is 3600.
    expect(await klerosgovernor.submissionTimeout()).to.deep.equal(
      web3.utils.toBN(3600)
    ) // Submission timeout is 3600

    await klerosgovernor.submitList(
      [klerosgovernor.address],
      [10],
      '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
      [36],
      'Only submission',
      { from: submitter1, value: 1e18 }
    )

    await time.increase(3601) // After submission timeout
    const oldBalance = await web3.eth.getBalance(submitter1)

    await klerosgovernor.executeSubmissions({ from: general })
    const newBalance = await web3.eth.getBalance(submitter1)

    const submission = await klerosgovernor.submissions(0)
    expect(submission[4]).to.equal(true) // The list should be approved
    expect(web3.utils.toBN(newBalance).toString()).to.equal(
      web3.utils
        .toBN(oldBalance)
        .add(web3.utils.toBN(1e18))
        .toString()
    ) // Incorrect submitter balance after approval

    let submittedLists = await klerosgovernor.getSubmittedLists(1)
    expect(submittedLists.length).to.equal(0) // The submission count should be set to 0 right after approval

    let sessionInfo = await klerosgovernor.sessions(1)
    expect(sessionInfo[2]).to.deep.equal(web3.utils.toBN(0)) // The sum of the deposits should be set to 0 right after approval

    // Check that submissions are working in the new submitting session
    await klerosgovernor.submitList([], [], '0x', [], "New sessions's list", {
      from: submitter2,
      value: 1e18
    })

    submittedLists = await klerosgovernor.getSubmittedLists(1)
    expect(submittedLists.length).to.equal(1) // The submission count in the new session is incorrect

    sessionInfo = await klerosgovernor.sessions(1)
    expect(sessionInfo[2]).to.deep.equal(web3.utils.toBN(1e18)) // The sum of the deposits in the new session is incorrect

    const numberOfLists = await klerosgovernor.getNumberOfCreatedLists()
    expect(numberOfLists).to.deep.equal(web3.utils.toBN(2)) // The number of created lists is incorrect

    sessionInfo = await klerosgovernor.sessions(0)
    expect(sessionInfo[3]).to.deep.equal(web3.utils.toBN(2)) // Previous session should have status resolved
  })

  it('Should create a dispute in arbitrator contract if more than one list was submitted', async () => {
    // Submission timeout is 3600 and arbitration fee is 0.1 ETH.
    expect(await klerosgovernor.submissionTimeout()).to.deep.equal(
      web3.utils.toBN(3600)
    ) // Submission timeout is 3600
    expect(await arbitrator.arbitrationCost(0x85)).to.deep.equal(
      web3.utils.toBN(0.1e18)
    ) // Arbitration fee is incorrect

    await klerosgovernor.submitList(
      [klerosgovernor.address],
      [10],
      '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
      [36],
      'List 1',
      { from: submitter1, value: 1e18 }
    )

    await klerosgovernor.submitList(
      [arbitrator.address],
      [10],
      '0x2462',
      [2],
      'List 2',
      { from: submitter2, value: 1e18 }
    )

    await klerosgovernor.submitList([], [], '0x24621111', [], 'List 3', {
      from: submitter3,
      value: 1e18
    })

    await time.increase(3601)
    let sessionInfo = await klerosgovernor.sessions(0)
    const oldSumDeposit = await sessionInfo[2]

    const executeTx = await klerosgovernor.executeSubmissions({ from: general })

    expect(executeTx.logs[0].event).to.equal('Dispute') // The dispute event has not been created
    expect(executeTx.logs[0].args._arbitrator).to.equal(arbitrator.address) // The event has the wrong arbitrator
    expect(executeTx.logs[0].args._disputeID).to.deep.equal(web3.utils.toBN(0)) // The event has the wrong disputeID
    expect(executeTx.logs[0].args._metaEvidenceID).to.deep.equal(
      web3.utils.toBN(0)
    ) // The event has the wrong metaevidence
    expect(executeTx.logs[0].args._evidenceGroupID).to.deep.equal(
      web3.utils.toBN(0)
    ) // The event has wrong list evidence group

    sessionInfo = await klerosgovernor.sessions(0)
    const newSumDeposit = await sessionInfo[2]

    expect(oldSumDeposit.sub(web3.utils.toBN(0.1e18)).toString()).to.equal(
      newSumDeposit.toString()
    ) // The sum of the deposits after dispute creation is incorrect
    expect(sessionInfo[3]).to.deep.equal(web3.utils.toBN(1)) // Incorrect status after dispute creation

    const dispute = await arbitrator.disputes(0)
    expect(dispute[0]).to.equal(klerosgovernor.address) // Arbitrable not set up properly
    expect(dispute[1]).to.deep.equal(web3.utils.toBN(3)) // Number of choices not set up properly
    expect(dispute[2]).to.deep.equal(web3.utils.toBN(0.1e18)) // Arbitration fee not set up properly

    // Shouldn't be possible to approve after dispute is created
    await expectRevert(
      klerosgovernor.executeSubmissions({ from: general }),
      "Can't approve transaction list while dispute is active."
    )
  })

  it('Should enforce a correct ruling to the dispute with no appeals', async () => {
    // Submission timeout is 3600 and appeal timeout is 1200.
    expect(await klerosgovernor.submissionTimeout()).to.deep.equal(
      web3.utils.toBN(3600)
    ) // Submission timeout is 3600
    expect(await arbitrator.timeOut()).to.deep.equal(web3.utils.toBN(1200)) // Appeal timeout is 1200

    await klerosgovernor.submitList(
      [klerosgovernor.address],
      [10],
      '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
      [36],
      'List 1',
      { from: submitter1, value: 1e18 }
    )

    await klerosgovernor.submitList(
      [arbitrator.address],
      [10],
      '0x2462',
      [2],
      'List 2',
      { from: submitter2, value: 1e18 }
    )

    await klerosgovernor.submitList([], [], '0x24621111', [], 'List 3', {
      from: submitter3,
      value: 1e18
    })

    await time.increase(3601)

    await klerosgovernor.executeSubmissions({ from: general })

    let sessionInfo = await klerosgovernor.sessions(0)

    await arbitrator.giveRuling(0, 1)
    await time.increase(1201)

    const oldBalance1 = await web3.eth.getBalance(submitter1)
    const oldBalance2 = await web3.eth.getBalance(submitter2)
    const oldBalance3 = await web3.eth.getBalance(submitter3)

    await arbitrator.giveRuling(0, 1)

    const newBalance1 = await web3.eth.getBalance(submitter1)
    const newBalance2 = await web3.eth.getBalance(submitter2)
    const newBalance3 = await web3.eth.getBalance(submitter3)

    expect(newBalance1.toString()).to.equal(
      web3.utils
        .toBN(oldBalance1)
        .add(sessionInfo[2])
        .toString()
    ) // Incorrect balance of the winning party after ruling
    // Balances of losing parties should stay the same
    expect(newBalance2).to.equal(oldBalance2) // Incorrect balance of the first losing party after ruling
    expect(newBalance3).to.equal(oldBalance3) // Incorrect balance of the second losing party after ruling

    const submission = await klerosgovernor.submissions(0)

    expect(submission[4]).to.equal(true) // The winning list should be approved

    const submittedLists = await klerosgovernor.getSubmittedLists(1)
    expect(submittedLists.length).to.equal(0) // The submission count should be 0 in the new session

    sessionInfo = await klerosgovernor.sessions(1)
    expect(sessionInfo[2]).to.deep.equal(web3.utils.toBN(0)) // The sum of the deposits should be 0 in the new session

    expect(sessionInfo[3]).to.deep.equal(web3.utils.toBN(0)) // Status should be 0 in the new session

    // Check that previous session stored correct values.
    sessionInfo = await klerosgovernor.sessions(0)
    expect(sessionInfo[0]).to.deep.equal(web3.utils.toBN(1)) // The ruling was set incorrectly

    expect(sessionInfo[3]).to.deep.equal(web3.utils.toBN(2)) // Previous session should have status resolved
  })

  it('Should enforce a correct ruling to the dispute after appeal', async () => {
    // Submission timeout is 3600, appeal timeout is 1200 and arbitration fee is 0.1 ETH.
    expect(await klerosgovernor.submissionTimeout()).to.deep.equal(
      web3.utils.toBN(3600)
    ) // Submission timeout is 3600
    expect(await arbitrator.timeOut()).to.deep.equal(web3.utils.toBN(1200)) // Appeal timeout is 1200
    expect(await arbitrator.arbitrationCost(0x85)).to.deep.equal(
      web3.utils.toBN(0.1e18)
    ) // Arbitration fee is 0.1 ETH

    await klerosgovernor.submitList(
      [klerosgovernor.address],
      [10],
      '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
      [36],
      'List 1',
      { from: submitter1, value: 1e18 }
    )

    await klerosgovernor.submitList(
      [arbitrator.address],
      [10],
      '0x2462',
      [2],
      'List 2',
      { from: submitter2, value: 1e18 }
    )

    await klerosgovernor.submitList([], [], '0x24621111', [], 'List 3', {
      from: submitter3,
      value: 1e18
    })

    await time.increase(3601)

    await klerosgovernor.executeSubmissions({ from: general })

    // Ruling 1 is equal to 0 submission index (submitter1)
    await arbitrator.giveRuling(0, 1)
    // Appeal fee is the same as arbitration fee for this arbitrator
    // loserAppealFee = 0.17e18 = 0.17 ETH = 0.1 + 70% * 0.1 ETH
    // = arbitrationFee + (arbitrationFee * loserMultiplier) / MULTIPLIER_DIVISOR

    await klerosgovernor.fundAppeal(1, {
      from: submitter2,
      value: 0.17e18
    })

    // Check that it's not possible to pay appeal fee twice
    await expectRevert(
      klerosgovernor.fundAppeal(1, {
        from: submitter2,
        value: 0.17e18
      }),
      'Appeal fee has already been paid.'
    )

    // Check that it's not possible to fund an out-of-bounds submission.
    await expectRevert(
      klerosgovernor.fundAppeal(3, {
        from: other,
        value: 5e18
      }),
      'SubmissionID is out of bounds.'
    )

    await time.increase(601)

    // Check that the 2nd loser can't pay in 2nd half
    await expectRevert(
      klerosgovernor.fundAppeal(2, {
        from: submitter3,
        value: 0.17e18
      }),
      'The loser must pay during the first half of the appeal period.'
    )

    // winnerAppealFee = 0.12e18 = 0.12 ETH = 0.1 + 20% * 0.1 ETH
    // = arbitrationFee + (arbitrationFee * winnerMultiplier) / MULTIPLIER_DIVISOR

    await klerosgovernor.fundAppeal(0, {
      from: submitter1,
      value: 0.12e18
    })

    const oldBalance1 = await web3.eth.getBalance(submitter1)
    const oldBalance2 = await web3.eth.getBalance(submitter2)
    const oldBalance3 = await web3.eth.getBalance(submitter3)

    // Change the ruling to submitter2.
    await arbitrator.giveRuling(1, 2)
    await time.increase(1201)
    await arbitrator.giveRuling(1, 2)

    const newBalance1 = await web3.eth.getBalance(submitter1)
    const newBalance2 = await web3.eth.getBalance(submitter2) // winner
    const newBalance3 = await web3.eth.getBalance(submitter3)

    // Winner also gets rewarded with losing parties' appeal fees but he gets them through another function.
    expect(newBalance1).to.equal(oldBalance1) // Incorrect balance of the first losing party after appealed ruling
    expect(newBalance2.toString()).to.equal(
      web3.utils
        .toBN(oldBalance2)
        .add(web3.utils.toBN(3e18))
        .sub(web3.utils.toBN(0.1e18))
        .toString()
    ) // Incorrect balance of the winning party after appealed ruling
    expect(newBalance3).to.equal(oldBalance3) // Incorrect balance of the second losing party after appealed ruling
    const submission = await klerosgovernor.submissions(1)
    expect(submission[4]).to.equal(true) // The winning list should be approved

    const sessionInfo = await klerosgovernor.sessions(0)
    expect(sessionInfo[0]).to.deep.equal(web3.utils.toBN(2)) // The ruling was set incorrectly
  })

  it('Should change the ruling if loser paid appeal fees while the winner did not', async () => {
    expect(await klerosgovernor.submissionTimeout()).to.deep.equal(
      web3.utils.toBN(3600)
    ) // Submission timeout is 3600
    expect(await arbitrator.timeOut()).to.deep.equal(web3.utils.toBN(1200)) // Appeal timeout is 1200

    await klerosgovernor.submitList(
      [klerosgovernor.address],
      [10],
      '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
      [36],
      'List 1',
      { from: submitter1, value: 1e18 }
    )

    await klerosgovernor.submitList(
      [arbitrator.address],
      [10],
      '0x2462',
      [2],
      'List 2',
      { from: submitter2, value: 1e18 }
    )

    await time.increase(3601)

    await klerosgovernor.executeSubmissions({ from: general })
    // Ruling 1 means arbitrator ruled in favor of submitter1
    await arbitrator.giveRuling(0, 1)

    // loserAppealFee = 0.17e18 = 0.17 ETH = 0.1 + 70% * 0.1 ETH
    // arbitrationFee + (arbitrationFee * loserMultiplier) / MULTIPLIER_DIVISOR

    await klerosgovernor.fundAppeal(1, { from: submitter2, value: 0.17e18 })

    const shadowWinner = await klerosgovernor.shadowWinner()
    expect(shadowWinner).to.deep.equal(web3.utils.toBN(1)) // The shadow winner was not tracked correctly by the contract

    await time.increase(1201)
    await arbitrator.giveRuling(0, 1)

    const losingList = await klerosgovernor.submissions(0)
    expect(losingList[4]).to.equal(false) // The first list should not be approved because it did not pay appeal fees

    const winningList = await klerosgovernor.submissions(1)
    expect(winningList[4]).to.equal(true) // The second list should be approved

    const sessionInfo = await klerosgovernor.sessions(0)
    expect(sessionInfo[0]).to.deep.equal(web3.utils.toBN(2)) // The ruling was set incorrectly
  })

  it('Should correctly execute transactions in the approved list (atomic execution)', async () => {
    expect(await klerosgovernor.submissionTimeout()).to.deep.equal(
      web3.utils.toBN(3600)
    ) // Submission timeout is 3600
    expect(await arbitrator.arbitrationCost(0x85)).to.deep.equal(
      web3.utils.toBN(0.1e18)
    ) // Arbitration fee is 0.1 ETH

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
      'Normal submission',
      { from: submitter1, value: 1e18 }
    )

    // The transaction should not be executed if list is not approved
    await expectRevert(
      klerosgovernor.executeTransactionList(0, 0, 1, { from: general }),
      "Can't execute list that wasn't approved."
    )

    await time.increase(3601)

    await klerosgovernor.executeSubmissions({ from: general })

    // Send spendable money via fallback.
    await klerosgovernor.sendTransaction({ from: other, value: 3e18 })

    // Execute the first and the second transactions separately to check atomic execution.
    await klerosgovernor.executeTransactionList(0, 0, 1, { from: general })

    const tx1 = await klerosgovernor.getTransactionInfo(0, 0)
    expect(tx1[3]).to.equal(true) // The first transaction should have status executed

    let tx2 = await klerosgovernor.getTransactionInfo(0, 1)
    expect(tx2[3]).to.equal(false) // The second transaction should not have status executed

    await klerosgovernor.executeTransactionList(0, 1, 1, { from: general })

    tx2 = await klerosgovernor.getTransactionInfo(0, 1)
    expect(tx2[3]).to.equal(true) // The second transaction should have status executed

    const dispute = await arbitrator.disputes(0)
    expect(dispute[0]).to.equal(klerosgovernor.address) // Incorrect arbitrable. First transaction was not executed correctly
    expect(dispute[1]).to.deep.equal(web3.utils.toBN(11)) // Incorrect number of choices. First transaction was not executed correctly
    expect(dispute[2]).to.deep.equal(web3.utils.toBN(1e17)) // Incorrect fee. First transaction was not executed correctly

    withdrawTime = await klerosgovernor.withdrawTimeout()
    expect(withdrawTime).to.deep.equal(web3.utils.toBN(20)) // The second transaction was not executed correctly
  })

  it('Should correctly execute transactions in the approved list (batch execution)', async () => {
    expect(await klerosgovernor.submissionTimeout()).to.deep.equal(
      web3.utils.toBN(3600)
    ) // Submission timeout is 3600
    expect(await arbitrator.arbitrationCost(0x85)).to.deep.equal(
      web3.utils.toBN(0.1e18)
    ) // Arbitration fee is 0.1 ETH

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
      'Normal submission',
      { from: submitter1, value: 1e18 }
    )

    await time.increase(3601)

    await klerosgovernor.executeSubmissions({ from: general })

    await klerosgovernor.sendTransaction({ from: other, value: 3e18 })

    await klerosgovernor.executeTransactionList(0, 0, 0, { from: general })

    const dispute = await arbitrator.disputes(0)
    expect(dispute[0]).to.equal(klerosgovernor.address) // Incorrect arbitrable. First transaction was not executed correctly
    expect(dispute[1]).to.deep.equal(web3.utils.toBN(11)) // Incorrect number of choices. First transaction was not executed correctly
    expect(dispute[2]).to.deep.equal(web3.utils.toBN(1e17)) // Incorrect fee. First transaction was not executed correctly

    const tx1 = await klerosgovernor.getTransactionInfo(0, 0)
    expect(tx1[3]).to.equal(true) // The first transaction should have status executed

    const withdrawTime = await klerosgovernor.withdrawTimeout()
    expect(withdrawTime).to.deep.equal(web3.utils.toBN(20)) // The second transaction was not executed correctly

    const tx2 = await klerosgovernor.getTransactionInfo(0, 1)
    expect(tx2[3]).to.equal(true) // The second transaction should have status executed
  })

  it('Should register payments correctly and withdraw correct fees if dispute had winner/loser', async () => {
    expect(await klerosgovernor.submissionTimeout()).to.deep.equal(
      web3.utils.toBN(3600)
    ) // Submission timeout is 3600
    expect(await arbitrator.timeOut()).to.deep.equal(web3.utils.toBN(1200)) // Appeal timeout is 1200
    expect(await arbitrator.arbitrationCost(0x85)).to.deep.equal(
      web3.utils.toBN(0.1e18)
    ) // Arbitration fee is 0.1 ETH

    await klerosgovernor.submitList(
      [klerosgovernor.address],
      [10],
      '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
      [36],
      'List 1',
      { from: submitter1, value: 1e18 }
    )

    await klerosgovernor.submitList(
      [arbitrator.address],
      [10],
      '0x2462',
      [2],
      'List 2',
      { from: submitter2, value: 1e18 }
    )

    await klerosgovernor.submitList([], [], '0x24621111', [], 'List 3', {
      from: submitter3,
      value: 1e18
    })

    await time.increase(3601)

    await klerosgovernor.executeSubmissions({ from: general })

    await arbitrator.giveRuling(0, 3)

    // loserAppealFee = 0.17e18 = 0.17 ETH = 0.1 + 70% * 0.1 ETH
    // arbitrationFee + (arbitrationFee * loserMultiplier) / MULTIPLIER_DIVISOR
    // winnerAppealFee = 0.12e18 = 0.12 ETH = 0.1 + 20% * 0.1 ETH
    // arbitrationFee + (arbitrationFee * winnerMultiplier) / MULTIPLIER_DIVISOR

    await klerosgovernor.fundAppeal(0, {
      from: submitter1,
      value: 0.17e18
    })

    // Deliberately underpay with 2nd loser to check correct fee distribution.
    await klerosgovernor.fundAppeal(1, {
      from: submitter2,
      value: 0.1e18
    })

    // Winner's fee is crowdfunded.
    await klerosgovernor.fundAppeal(2, {
      from: other,
      value: 0.09e18 // 75%
    })

    await klerosgovernor.fundAppeal(2, {
      from: submitter3,
      value: 1e18 // > 100%
    })

    // Check that it's not possible to withdraw fees if dispute is unresolved.
    await expectRevert(
      klerosgovernor.withdrawFeesAndRewards(submitter1, 0, 0, 0, {
        from: general
      }),
      'Session has an ongoing dispute.'
    )

    // Check that contract registers paid fees correctly.
    const roundInfo = await klerosgovernor.getRoundInfo(0, 0)
    expect(roundInfo[0][0]).to.deep.equal(web3.utils.toBN(0.17e18)) // Registered fee of the first loser is incorrect
    expect(roundInfo[1][0]).to.equal(true) // Did not register that first loser successfully paid his fees
    expect(roundInfo[0][1]).to.deep.equal(web3.utils.toBN(0.1e18)) // Registered fee of the second loser is incorrect
    expect(roundInfo[1][1]).to.equal(false) // Should not register that second loser successfully paid his fees
    expect(roundInfo[0][2]).to.deep.equal(web3.utils.toBN(0.12e18)) // Registered fee of the winner is incorrect
    expect(roundInfo[1][2]).to.equal(true) // Did not register that the winner successfully paid his fees
    // winnerAppealFee + loserAppealFee - arbitrationFee
    expect(roundInfo[2]).to.deep.equal(web3.utils.toBN(0.19e18)) // Incorrect fee rewards value
    // winnerAppealFee + loserAppealFee
    expect(roundInfo[3]).to.deep.equal(web3.utils.toBN(0.29e18)) // Incorrect successfully paid fees value

    await arbitrator.giveRuling(1, 3)

    // 2nd loser underpays again in the last round.
    await klerosgovernor.fundAppeal(1, {
      from: submitter2,
      value: 0.16e18
    })

    await time.increase(1201)
    await arbitrator.giveRuling(1, 3)

    const oldBalance1 = await web3.eth.getBalance(submitter1)
    await klerosgovernor.withdrawFeesAndRewards(submitter1, 0, 0, 0, {
      from: general
    })
    const newBalance1 = await web3.eth.getBalance(submitter1)
    expect(newBalance1).to.deep.equal(oldBalance1) // Balance of the first loser should stay the same
    let oldBalance2 = await web3.eth.getBalance(submitter2)
    await klerosgovernor.withdrawFeesAndRewards(submitter2, 0, 0, 1, {
      from: general
    })
    let newBalance2 = await web3.eth.getBalance(submitter2)
    expect(newBalance2.toString()).to.equal(
      web3.utils
        .toBN(oldBalance2)
        .add(web3.utils.toBN(0.1e18))
        .toString()
    ) // Second loser should be reimbursed what he paid in the first round

    oldBalance2 = await web3.eth.getBalance(submitter2)
    await klerosgovernor.withdrawFeesAndRewards(submitter2, 0, 1, 1, {
      from: general
    })
    newBalance2 = await web3.eth.getBalance(submitter2)
    expect(newBalance2.toString()).to.equal(
      web3.utils
        .toBN(oldBalance2)
        .add(web3.utils.toBN(0.16e18))
        .toString()
    ) // Second loser should be reimbursed what he paid in the last round

    const oldBalance3 = await web3.eth.getBalance(submitter3)
    await klerosgovernor.withdrawFeesAndRewards(submitter3, 0, 0, 2, {
      from: general
    })
    const newBalance3 = await web3.eth.getBalance(submitter3) // winner
    // 25% * 0.19 ETH
    expect(newBalance3.toString()).to.equal(
      web3.utils
        .toBN(oldBalance3)
        .add(web3.utils.toBN(0.0475e18))
        .toString()
    ) // Incorrect balance of the first crowdfunder after funding winning list
    const oldBalance4 = await web3.eth.getBalance(other)
    await klerosgovernor.withdrawFeesAndRewards(other, 0, 0, 2, {
      from: general
    })
    const newBalance4 = await web3.eth.getBalance(other)
    // 75% * 0.19 ETH
    expect(newBalance4.toString()).to.equal(
      web3.utils
        .toBN(oldBalance4)
        .add(web3.utils.toBN(0.1425e18))
        .toString()
    ) // Incorrect balance of the second crowdfunder after funding winning list
  })

  it('Should withdraw correct fees if arbitrator refused to arbitrate', async () => {
    expect(await klerosgovernor.submissionTimeout()).to.deep.equal(
      web3.utils.toBN(3600)
    ) // Submission timeout is 3600
    expect(await arbitrator.timeOut()).to.deep.equal(web3.utils.toBN(1200)) // Appeal timeout is 1200
    expect(await arbitrator.arbitrationCost(0x85)).to.deep.equal(
      web3.utils.toBN(0.1e18)
    ) // Arbitration fee is 0.1 ETH

    await klerosgovernor.submitList(
      [klerosgovernor.address],
      [10],
      '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
      [36],
      'List 1',
      { from: submitter1, value: 1e18 }
    )

    await klerosgovernor.submitList(
      [arbitrator.address],
      [10],
      '0x2462',
      [2],
      'List 2',
      { from: submitter2, value: 1e18 }
    )

    await klerosgovernor.submitList([], [], '0x24621111', [], 'List 3', {
      from: submitter3,
      value: 1e18
    })

    await time.increase(3601)

    await klerosgovernor.executeSubmissions({ from: general })

    await arbitrator.giveRuling(0, 0)

    // sharedAppealFee = 0.15e18 = 0.15 ETH = 0.1 + 50% * 0.1 ETH
    // = arbitrationFee + (arbitrationFee * sharedMultiplier) / MULTIPLIER_DIVISOR

    // Deliberately underpay with 3rd submitter.
    await klerosgovernor.fundAppeal(2, {
      from: submitter3,
      value: 0.045e18 // 30%
    })

    await klerosgovernor.fundAppeal(0, {
      from: other,
      value: 0.03e18 // 20%
    })

    await klerosgovernor.fundAppeal(0, {
      from: submitter1,
      value: 1e18 // > 100%
    })

    await klerosgovernor.fundAppeal(1, {
      from: other,
      value: 0.06e18 // 40%
    })

    await klerosgovernor.fundAppeal(1, {
      from: submitter2,
      value: 1e18 // > 100%
    })

    await arbitrator.giveRuling(1, 0)
    await time.increase(1201)
    await arbitrator.giveRuling(1, 0)

    const oldBalance1 = await web3.eth.getBalance(submitter1)
    await klerosgovernor.withdrawFeesAndRewards(submitter1, 0, 0, 0, {
      from: general
    })
    const newBalance1 = await web3.eth.getBalance(submitter1)
    // 80%/2 * (2 * sharedAppealFee - arbitrationFee)
    expect(newBalance1.toString()).to.equal(
      web3.utils
        .toBN(oldBalance1)
        .add(web3.utils.toBN(0.08e18))
        .toString()
    ) // Incorrect balance of the first submitter
    const oldBalance2 = await web3.eth.getBalance(submitter2)
    await klerosgovernor.withdrawFeesAndRewards(submitter2, 0, 0, 1, {
      from: general
    })
    const newBalance2 = await web3.eth.getBalance(submitter2)
    // 60%/2 * (2 * sharedAppealFee - arbitrationFee)
    expect(newBalance2.toString()).to.equal(
      web3.utils
        .toBN(oldBalance2)
        .add(web3.utils.toBN(0.06e18))
        .toString()
    ) // Incorrect balance of the second submitter

    const oldBalance3 = await web3.eth.getBalance(submitter3)
    await klerosgovernor.withdrawFeesAndRewards(submitter3, 0, 0, 2, {
      from: general
    })
    const newBalance3 = await web3.eth.getBalance(submitter3)
    // 30% * sharedAppealFee
    expect(newBalance3.toString()).to.equal(
      web3.utils
        .toBN(oldBalance3)
        .add(web3.utils.toBN(0.045e18))
        .toString()
    ) // Incorrect balance of the third submitter
    const oldBalance4 = await web3.eth.getBalance(other)
    await klerosgovernor.withdrawFeesAndRewards(other, 0, 0, 0, {
      from: general
    })
    await klerosgovernor.withdrawFeesAndRewards(other, 0, 0, 1, {
      from: general
    })
    const newBalance4 = await web3.eth.getBalance(other)
    // 30% * (2 * sharedAppealFee - arbitrationFee)
    expect(newBalance4.toString()).to.equal(
      web3.utils
        .toBN(oldBalance4)
        .add(web3.utils.toBN(0.06e18))
        .toString()
    ) // Incorrect balance of the crowdfunder
  })

  it('Check that funds are tracked correctly', async () => {
    expect(await klerosgovernor.submissionTimeout()).to.deep.equal(
      web3.utils.toBN(3600)
    ) // Submission timeout is 3600
    expect(await klerosgovernor.executionTimeout()).to.deep.equal(
      web3.utils.toBN(3000)
    ) // Execution timeout is 3000
    expect(await arbitrator.timeOut()).to.deep.equal(web3.utils.toBN(1200)) // Appeal timeout is 1200

    let reservedETH
    let expendableFunds

    await klerosgovernor.submitList(
      [arbitrator.address],
      ['100000000000000000'],
      '0xc13517e1000000000000000000000000000000000000000000000000000000000000000b00000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000001fa',
      [101],
      'List 1',
      { from: submitter1, value: 1e18 }
    )

    await klerosgovernor.submitList(
      [klerosgovernor.address],
      [10],
      '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
      [36],
      'List 2',
      { from: submitter2, value: 1e18 }
    )

    reservedETH = await klerosgovernor.reservedETH()
    expect(reservedETH).to.deep.equal(web3.utils.toBN(2e18)) // Reserved funds are not tracked correctly

    const list2Info = await klerosgovernor.submissions(1)
    const list2Hash = await list2Info[2]

    await klerosgovernor.withdrawTransactionList(1, list2Hash, {
      from: submitter2
    })

    reservedETH = await klerosgovernor.reservedETH()
    expect(reservedETH).to.deep.equal(web3.utils.toBN(1e18)) // Reserved funds are not tracked correctly after withdrawal

    // Submit the same list again so we could have a dispute.
    await klerosgovernor.submitList(
      [klerosgovernor.address],
      [10],
      '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
      [36],
      'Dispute list',
      { from: submitter2, value: 1e18 }
    )

    await time.increase(3601)

    await klerosgovernor.executeSubmissions({ from: general })

    reservedETH = await klerosgovernor.reservedETH()
    expect(reservedETH).to.deep.equal(web3.utils.toBN(1.9e18)) // Reserved funds are not tracked correctly after dispute creation

    await arbitrator.giveRuling(0, 2)

    // loserAppealFee = 0.17e18 = 0.17 ETH = 0.1 + 70% * 0.1 ETH
    // arbitrationFee + (arbitrationFee * loserMultiplier) / MULTIPLIER_DIVISOR
    // winnerAppealFee = 0.12e18 = 0.12 ETH = 0.1 + 20% * 0.1 ETH
    // arbitrationFee + (arbitrationFee * winnerMultiplier) / MULTIPLIER_DIVISOR

    await klerosgovernor.fundAppeal(0, {
      from: submitter1,
      value: 0.17e18
    })

    reservedETH = await klerosgovernor.reservedETH()
    // 2 submission deposits (2e18) - arbitrationFee (1e17) + loserFee(1.7e17)
    expect(reservedETH).to.deep.equal(web3.utils.toBN(20.7e17)) // Reserved funds are not tracked correctly after loser funding

    await klerosgovernor.fundAppeal(1, {
      from: other,
      value: 0.12e18
    })

    reservedETH = await klerosgovernor.reservedETH()
    // Add winnerFee (1.2e17) - appealFee(1e17)
    expect(reservedETH).to.deep.equal(web3.utils.toBN(20.9e17)) // Reserved funds are not tracked correctly after appeal creation

    await arbitrator.giveRuling(1, 1)
    await time.increase(1201)
    await arbitrator.giveRuling(1, 1)

    // SumDeposit value (1.9e18) should be subtracted.
    reservedETH = await klerosgovernor.reservedETH()
    expect(reservedETH).to.deep.equal(web3.utils.toBN(1.9e17)) // Reserved funds are not tracked correctly after list execution

    // Check expendable funds while reserved funds are not yet depleted to make sure their values are not confused.
    expendableFunds = await klerosgovernor.getExpendableFunds()
    expect(expendableFunds).to.deep.equal(web3.utils.toBN(0)) // The contract should not have expendable funds yet

    await klerosgovernor.withdrawFeesAndRewards(submitter1, 0, 0, 0, {
      from: general
    })

    reservedETH = await klerosgovernor.reservedETH()
    expect(reservedETH).to.deep.equal(web3.utils.toBN(0)) // All reserved funds should be depleted

    await klerosgovernor.sendTransaction({ from: other, value: 3e18 })

    expendableFunds = await klerosgovernor.getExpendableFunds()
    expect(expendableFunds).to.deep.equal(web3.utils.toBN(3e18)) // Incorrect expendable funds value after funding

    await klerosgovernor.executeTransactionList(0, 0, 0, { from: general }) // Changes withdraw timeout to 20
    expendableFunds = await klerosgovernor.getExpendableFunds()
    expect(expendableFunds).to.deep.equal(web3.utils.toBN(2.9e18)) // Incorrect expendable funds value after execution

    // Check that the transaction was correctly executed
    const dispute = await arbitrator.disputes(2)
    expect(dispute[0]).to.equal(klerosgovernor.address) // Incorrect arbitrable. First transaction was not executed correctly
    expect(dispute[1]).to.deep.equal(web3.utils.toBN(11)) // Incorrect number of choices. First transaction was not executed correctly
    expect(dispute[2]).to.deep.equal(web3.utils.toBN(1e17)) // Incorrect fee. First transaction was not executed correctly

    const newWithdrawTimeout = await klerosgovernor.withdrawTimeout()
    expect(newWithdrawTimeout).to.not.equal(web3.utils.toBN(20)) // The rejected transaction was executed
  })

  it('Should not be possible to execute transaction list after the execution timeout', async () => {
    await klerosgovernor.submitList(
      [klerosgovernor.address],
      [0],
      '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
      [36],
      'After execution timeout',
      { from: submitter1, value: 1e18 }
    )

    await time.increase(3601)

    await klerosgovernor.executeSubmissions({ from: general })

    await klerosgovernor.sendTransaction({ from: other, value: 3e18 })

    await time.increase(3001)
    await expectRevert(
      klerosgovernor.executeTransactionList(0, 0, 0, { from: general }),
      'Time to execute the transaction list has passed.'
    )
  })
})
