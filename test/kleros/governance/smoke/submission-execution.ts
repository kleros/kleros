import { expect } from 'chai';

import { GovernorStatus as Status } from 'utils';
import { increaseTime } from 'utils/test-helpers';
import {
  useInitialSetup,
  useListSubmissionSetup,
} from 'utils/fixtures/kleros-governor';

describe('Smoke: Governor - Submission Execution', () => {
  const listDescription = 'tx1, tx2, tx3';
  it('Should advance to approval period if no submitted list', async () => {
    const { governor, args, users } = await useInitialSetup();

    // Shouldn't be possible to switch to approval period before timeout
    await expect(governor.connect(users.deployer).executeSubmissions()).to.be
      .reverted;

    await increaseTime(args.submissionTimeout + 1);
    await governor.connect(users.deployer).executeSubmissions();

    expect(await governor.getCurrentSessionNumber()).to.equal(1);
    expect((await governor.sessions(0)).status).to.equal(Status.Resolved);
  });

  it('Should approve a list if one submitted list', async () => {
    const { governor, args, users } = await useListSubmissionSetup();

    await increaseTime(args.submissionTimeout + 1);
    await governor.connect(users.deployer).executeSubmissions();

    const submission = await governor.submissions(0);
    expect(submission.approved, 'The list should be approved').to.equal(true);

    let submittedLists = await governor.getSubmittedLists(1);
    expect(
      submittedLists.length,
      'The submission count should be set to 0 right after approval'
    ).to.equal(0);
  });

  it('Should create a dispute if more than one submitted list', async () => {
    const {
      governor,
      appeableArbitrator,
      args,
      users,
    } = await useListSubmissionSetup();

    await governor.submitList(
      [appeableArbitrator.address],
      [10],
      '0x2462',
      [2],
      listDescription,
      {
        value: args.submissionDeposit(),
      }
    );

    await governor
      .connect(users.submitter3)
      .submitList([], [], '0x24621111', [], listDescription, {
        value: args.submissionDeposit(),
      });
    await increaseTime(args.submissionTimeout + 1);

    await expect(governor.connect(users.deployer).executeSubmissions())
      .to.emit(governor, 'Dispute')
      .withArgs(appeableArbitrator.address, 0, 0, 0);

    const dispute = await appeableArbitrator.disputes(0);

    expect(dispute.arbitrated).to.equal(governor.address);
    expect(dispute.choices).to.equal(3);
    expect(dispute.fee).to.equal(args.arbitrationFee);
  });

  it('Should check that submissions are working in the new submitting session', async () => {
    const { governor, args, users } = await useListSubmissionSetup();

    await increaseTime(args.submissionTimeout + 1);
    await governor.connect(users.deployer).executeSubmissions();

    // Check that submissions are working in the new submitting session
    await governor
      .connect(users.submitter2)
      .submitList([], [], '0x00', [], listDescription, {
        value: args.submissionDeposit(),
      });

    const submittedLists = await governor.getSubmittedLists(1);
    expect(
      submittedLists.length,
      'The submission count in the new session is incorrect'
    ).to.equal(1);

    const numberOfLists = await governor.getNumberOfCreatedLists();
    expect(numberOfLists, 'The number of created lists is incorrect').to.equal(
      2
    );

    const latestSession = await governor.getCurrentSessionNumber();
    let sessionInfo = await governor.sessions(latestSession);
    expect(
      sessionInfo.status,
      'Status should be NoDispute in the new session'
    ).to.equal(Status.NoDispute);

    sessionInfo = await governor.sessions(latestSession.sub(1));
    expect(
      sessionInfo.status,
      'Previous session should have status resolved'
    ).to.equal(Status.Resolved);

    expect(
      sessionInfo.sumDeposit,
      'The sum of the deposits should be 0 in the previous session'
    ).to.equal(0);
  });
});
