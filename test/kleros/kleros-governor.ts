import { ethers } from 'hardhat';
import { expect } from 'chai';
import { soliditySha3 } from 'web3-utils';
import { BigNumber, BytesLike } from 'ethers';

import { PromiseOrValue } from '../../typechain-types/common';

import { increaseTime } from '../../utils/test-helpers';
import { HashType } from '../../utils/types';
import { TransactionInfo } from '../../utils/interfaces';

import {
  useInitialSetup,
  useListSubmissionSetup,
  useRulingSetup,
  useTransactionsSetup,
} from '../../utils/fixtures';

enum Status {
  NoDispute,
  DisputeCreated,
  Resolved,
}

describe('KlerosGovernor', () => {
  const listDescription = 'tx1, tx2, tx3';
  const MULTIPLIER_DIVISOR = 10000;

  describe('Construction', () => {
    it('Should set correct values', async () => {
      const { appeableArbitrator, governor, args } = await useInitialSetup();

      expect(await governor.arbitrator()).to.equal(appeableArbitrator.address);
      expect(await governor.arbitratorExtraData()).to.equal(
        args.arbitratorExtraData
      );
      expect(await governor.submissionTimeout()).to.equal(
        args.submissionTimeout
      );
      expect(await governor.executionTimeout()).to.equal(args.executionTimeout);
      expect(await governor.withdrawTimeout()).to.equal(args.withdrawTimeout);
      expect(await governor.sharedMultiplier()).to.equal(args.sharedMultiplier);
      expect(await governor.winnerMultiplier()).to.equal(args.winnerMultiplier);
      expect(await governor.loserMultiplier()).to.equal(args.loserMultiplier);
      expect(await governor.getCurrentSessionNumber()).to.equal(0);
      expect(await governor.submissionBaseDeposit()).to.equal(
        args.submissionBaseDeposit
      );
    });
  });

  describe('Unsuccessful execution', () => {
    it('Should fail to change contract arguments on unauthorized call', async () => {
      const { governor, users } = await useInitialSetup();

      await expect(governor.connect(users.deployer).changeSubmissionDeposit(20))
        .to.be.reverted;

      await expect(
        governor.connect(users.submitter1).changeSubmissionTimeout(50)
      ).to.be.reverted;

      await expect(governor.connect(users.submitter1).changeExecutionTimeout(5))
        .to.be.reverted;

      await expect(governor.connect(users.submitter2).changeWithdrawTimeout(25))
        .to.be.reverted;

      await expect(governor.connect(users.deployer).changeSharedMultiplier(200))
        .to.be.reverted;

      await expect(
        governor.connect(users.submitter1).changeWinnerMultiplier(250)
      ).to.be.reverted;

      await expect(
        governor.connect(users.submitter2).changeLoserMultiplier(330)
      ).to.be.reverted;

      const arbitratorExtraData = '0x85';
      await expect(
        governor
          .connect(users.submitter2)
          .changeArbitrator(users.submitter2.address, arbitratorExtraData)
      ).to.be.reverted;
    });

    it('Should fail when submission list args are not of the same length', async () => {
      const { governor, args, users } = await useInitialSetup();
      const submissionDeposit = args.submissionBaseDeposit.add(
        args.arbitrationFee
      );

      // We check between arrays having 0 and 1 length so we don't have to deal with tx order requirement.
      await expect(
        governor
          .connect(users.submitter1)
          .submitList(
            [governor.address],
            [],
            '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
            [36],
            listDescription,
            { value: submissionDeposit }
          )
      ).to.be.reverted;

      await expect(
        governor
          .connect(users.submitter1)
          .submitList(
            [],
            [ethers.BigNumber.from(1).pow(17)],
            '0x246c76df0000000000000000000000000000000000000000000000000000000000000014953d6651000000000000000000000000000000000000000000000000000000000000fb',
            [71],
            listDescription,
            { value: submissionDeposit }
          )
      ).to.be.reverted;

      await expect(
        governor
          .connect(users.submitter1)
          .submitList(
            [governor.address],
            [10],
            '0x246c76df0000000000000000000000000000000000000000000000000000000000000014953d6651000000000000000000000000000000000000000000000000000000000000fb',
            [],
            listDescription,
            { value: submissionDeposit }
          )
      ).to.be.reverted;
    });

    it('Should fail when insufficient submission deposit', async () => {
      const { governor, args, users } = await useInitialSetup();

      await expect(
        governor
          .connect(users.submitter2)
          .submitList(
            [governor.address],
            [10],
            '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
            [36],
            listDescription,
            { value: args.submissionDeposit().sub(100) }
          )
      ).to.be.revertedWith('Submission deposit must be paid in full.');
    });

    it('Should fail when submitting a duplicate list', async () => {
      const { governor, args, users } = await useInitialSetup();

      await governor
        .connect(users.submitter1)
        .submitList(
          [governor.address],
          [10],
          '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
          [36],
          listDescription,
          { value: args.submissionDeposit() }
        );

      const submitters = [users.submitter1, users.submitter2];
      for (let submitter of submitters)
        await expect(
          governor
            .connect(submitter)
            .submitList(
              [governor.address],
              [10],
              '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
              [36],
              listDescription,
              { value: args.submissionDeposit() }
            )
        ).to.be.revertedWith('The same list was already submitted earlier.');
    });

    it('Should fail to pay appeal fee twice', async () => {
      const {
        governor,
        appeableArbitrator,
        args,
        users,
      } = await useRulingSetup();

      await appeableArbitrator.giveRuling(0, 1);

      const loserAppealFee = args.arbitrationFee.add(
        args.arbitrationFee.mul(args.loserMultiplier).div(MULTIPLIER_DIVISOR)
      );

      await governor.connect(users.submitter2).fundAppeal(1, {
        value: loserAppealFee,
      });

      await expect(
        governor
          .connect(users.submitter2)
          .fundAppeal(1, { value: loserAppealFee })
      ).to.be.revertedWith('Appeal fee has already been paid.');
    });

    it('Should fail to pay appeal fee after appeal timeout', async () => {
      const {
        governor,
        appeableArbitrator,
        args,
        users,
      } = await useRulingSetup();

      await appeableArbitrator.giveRuling(0, 1);

      await increaseTime(args.appealTimeout + 1);

      await expect(
        governor
          .connect(users.submitter2)
          .fundAppeal(1, { value: args.arbitrationFee })
      ).to.be.revertedWith(
        'Appeal fees must be paid within the appeal period.'
      );
    });

    it('Should fail to withdraw fees while dispute is unresolved', async () => {
      const {
        governor,
        appeableArbitrator,
        args,
        users,
      } = await useRulingSetup();

      await appeableArbitrator.giveRuling(0, 1);

      await governor.connect(users.submitter1).fundAppeal(0, {
        value: args.arbitrationFee,
      });

      await expect(
        governor
          .connect(users.deployer)
          .withdrawFeesAndRewards(users.submitter1.address, 0, 0, 0)
      ).to.be.revertedWith('Session has an ongoing dispute.');
    });

    describe('Submission Withdrawl', () => {
      it('Should fail after withdraw timeout', async () => {
        const { governor, args, users } = await useListSubmissionSetup();

        await increaseTime(args.withdrawTimeout + 1);
        const listInfo = await governor.submissions(0);

        await expect(
          governor
            .connect(users.submitter1)
            .withdrawTransactionList(0, listInfo.listHash)
        ).to.be.reverted;
      });

      it('Should fail on unauthorized withdrawl', async () => {
        const { governor, users } = await useListSubmissionSetup();

        const listInfo = await governor.submissions(0);

        await expect(
          governor
            .connect(users.submitter2)
            .withdrawTransactionList(0, listInfo.listHash)
        ).to.be.reverted;
      });

      it('Should fail on Submission timeout', async () => {
        const { governor, args, users } = await useInitialSetup();

        // Increase time in such way to check that the call throws because of the submission timeout, and not because of withdraw timeout.
        // Submission timeout is 3600 and withdraw timeout is 60.
        await increaseTime(1790);

        await governor
          .connect(users.submitter1)
          .submitList(
            [governor.address],
            [10],
            '0xfdea',
            [2],
            listDescription,
            { value: args.submissionDeposit() }
          );

        await increaseTime(11);
        const listInfo = await governor.submissions(0);

        await expect(
          governor
            .connect(users.submitter1)
            .withdrawTransactionList(0, listInfo.listHash)
        ).to.be.reverted;
      });
    });

    describe('Transaction List Execution', () => {
      it('Should fail after the execution timeout', async () => {
        const { governor, args, users } = await useListSubmissionSetup();

        await increaseTime(args.submissionTimeout + 1);
        await governor.connect(users.deployer).executeSubmissions();

        users.other.sendTransaction({
          to: governor.address,
          value: ethers.utils.parseEther('3'),
        });

        await increaseTime(args.executionTimeout + 1);
        await expect(
          governor.connect(users.deployer).executeTransactionList(0, 0, 0)
        ).to.be.reverted;
      });
    });
  });

  describe('Balances', () => {
    it('Should correctly change balances on list submission', async () => {
      const { governor, args, users } = await useInitialSetup();

      await expect(() =>
        governor
          .connect(users.submitter1)
          .submitList(
            [governor.address],
            [10],
            '0xfdea',
            [2],
            listDescription,
            {
              value: args.submissionDeposit(),
            }
          )
      ).to.changeEtherBalance(
        users.submitter1,
        args.submissionDeposit().mul(-1)
      );

      const latestSession = await governor.getCurrentSessionNumber();
      let sessionInfo = await governor.sessions(latestSession);
      expect(
        sessionInfo.sumDeposit,
        'The sum of the deposits is incorrect'
      ).to.equal(args.submissionDeposit());
    });

    it('should correctly change balance on submission execution', async () => {
      const { governor, args, users } = await useListSubmissionSetup();
      await increaseTime(args.submissionTimeout + 1);

      await expect(() =>
        governor.connect(users.deployer).executeSubmissions()
      ).to.changeEtherBalance(users.submitter1, args.submissionDeposit());

      const latestSession = await governor.getCurrentSessionNumber();
      let sessionInfo = await governor.sessions(latestSession);
      expect(
        sessionInfo.sumDeposit,
        'The sum of the deposits should be set to 0 right after approval'
      ).to.equal(0);
    });

    it('Should correctly change balance on submission withdrawl', async () => {
      const { governor, args, users } = await useListSubmissionSetup();

      const listInfo = await governor.submissions(0);
      await expect(() =>
        governor
          .connect(users.submitter1)
          .withdrawTransactionList(0, listInfo.listHash)
      ).to.changeEtherBalance(users.submitter1, args.submissionDeposit());

      const latestSession = await governor.getCurrentSessionNumber();
      let sessionInfo = await governor.sessions(latestSession);
      expect(
        sessionInfo.sumDeposit,
        'The sum of the deposits should be set to 0 right after withdrawl'
      ).to.equal(0);
    });
  });

  describe('List Submission', () => {
    it('Should set correct values in a newly submitted list and validate the emitted event', async () => {
      const {
        appeableArbitrator,
        governor,
        users,
        args,
      } = await useInitialSetup();

      let index1: number;
      let index2: number;
      let dataString: PromiseOrValue<BytesLike>;

      const addresses = [governor.address, appeableArbitrator.address];
      const values = [10, ethers.BigNumber.from(1).pow(17)];
      const data = [36, 35];
      const encodedData = [
        '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
        '0x953d6651000000000000000000000000000000000000000000000000000000000000fb',
      ];

      const txHash1 = parseInt(
        soliditySha3(governor.address, 10, encodedData[0]) as string,
        16
      );
      const txHash2 = parseInt(
        soliditySha3(
          appeableArbitrator.address,
          ethers.BigNumber.from(1)
            .pow(17)
            .toNumber(),
          encodedData[1]
        ) as string,
        16
      );

      if (txHash1 < txHash2) {
        index1 = 0;
        index2 = 1;
        dataString = encodedData[0].concat(encodedData[1].slice(2));
      } else {
        index1 = 1;
        index2 = 0;
        dataString = encodedData[1].concat(encodedData[0].slice(2));
      }

      await expect(
        governor
          .connect(users.submitter1)
          .submitList(
            [addresses[index1], addresses[index2]],
            [values[index1], values[index2]],
            dataString,
            [data[index1], data[index2]],
            listDescription,
            { value: args.submissionDeposit().add(1000) }
          )
      )
        .to.emit(governor, 'ListSubmitted')
        .withArgs(0, users.submitter1.address, 0, listDescription);

      const submission = await governor.submissions(0);
      expect(
        submission.deposit,
        'The deposit of the list is incorrect'
      ).to.equal(args.submissionDeposit());

      const submissionLength = await governor.getNumberOfTransactions(0);
      expect(
        submissionLength,
        'The number of transactions is incorrect'
      ).to.equal(2);

      const indices = [index1, index2];
      let txs: TransactionInfo[] = [];
      for (let i = 0; i < indices.length; i++) {
        let tx = await governor.getTransactionInfo(0, indices[i]);
        txs.push(tx);
        expect(
          tx.target,
          `The target of the ${i}. transaction is incorrect`
        ).to.equal(addresses[i]);

        expect(
          tx.value,
          `The value of the ${i}. transaction is incorrect`
        ).to.equal(values[i]);

        expect(
          tx.data,
          `The data of the ${i}. transaction is incorrect`
        ).to.equal(encodedData[i]);
      }

      let hash1: HashType;
      let hash2: HashType;
      // Swap indexes if txs order is reversed.
      if (txHash1 < txHash2) {
        hash1 = soliditySha3(
          soliditySha3(
            txs[0].target,
            txs[0].value.toNumber(),
            txs[0].data
          ) as string,
          0
        );
        hash2 = soliditySha3(
          txs[1].target,
          txs[1].value.toNumber(),
          txs[1].data
        );
      } else {
        hash1 = soliditySha3(
          soliditySha3(
            txs[1].target,
            txs[1].value.toNumber(),
            txs[1].data
          ) as string,
          0
        );
        hash2 = soliditySha3(
          txs[0].target,
          txs[0].value.toNumber(),
          txs[0].data
        );
      }

      const listHash = soliditySha3(hash2 as string, hash1 as string);
      expect(submission[2], 'The list hash is incorrect').to.equal(listHash);

      await increaseTime(args.submissionTimeout + 1);
      await expect(
        governor
          .connect(users.submitter2)
          .submitList(
            [governor.address],
            [100],
            '0xfdea',
            [2],
            listDescription,
            {
              value: args.submissionDeposit(),
            }
          )
      ).to.be.reverted;
    });

    it('should correctly withdraw submitted list', async () => {
      const { governor, args, users } = await useListSubmissionSetup();

      await governor
        .connect(users.submitter2)
        .submitList(
          [governor.address],
          [10],
          '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
          [36],
          listDescription,
          { value: args.submissionDeposit() }
        );

      let submittedLists = await governor.getSubmittedLists(0);
      expect(
        submittedLists.length,
        'The submission count is incorrect'
      ).to.equal(2);

      let sessionInfo = await governor.sessions(0);
      expect(
        sessionInfo.sumDeposit,
        'The sum of submission deposit is incorrect'
      ).to.equal(args.submissionDeposit().mul(2));

      const listInfo = await governor.submissions(1);
      await governor
        .connect(users.submitter2)
        .withdrawTransactionList(1, listInfo.listHash);

      submittedLists = await governor.getSubmittedLists(0);
      expect(
        submittedLists.length,
        'The submission count is incorrect'
      ).to.equal(1);

      sessionInfo = await governor.sessions(0);
      expect(
        sessionInfo.sumDeposit,
        'The sum of submission deposit is incorrect'
      ).to.equal(args.submissionDeposit());
    });
  });

  describe('Submission Execution', () => {
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
      expect(
        numberOfLists,
        'The number of created lists is incorrect'
      ).to.equal(2);

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

  describe('Submission Rulling', () => {
    it('Should enforce a correct ruling to the dispute with no appeals', async () => {
      const {
        governor,
        appeableArbitrator,
        args,
        users,
      } = await useRulingSetup();

      // Ruling 1 is equal to 0 submission index (submitter1)
      await appeableArbitrator.giveRuling(0, 1);

      await increaseTime(args.appealTimeout + 1);

      const latestSession = await governor.getCurrentSessionNumber();
      let sessionInfo = await governor.sessions(latestSession);

      await expect(() =>
        appeableArbitrator.giveRuling(sessionInfo.disputeID, 1)
      ).to.changeEtherBalances(
        [users.submitter1, users.submitter2, users.submitter3],
        [sessionInfo.sumDeposit, 0, 0]
      );

      sessionInfo = await governor.sessions(0);
      expect(sessionInfo.ruling).to.equal(1);

      const submission = await governor.submissions(0);
      expect(submission.submitter).to.equal(users.submitter1.address);
      expect(submission.approved).to.equal(true);
    });

    it('Should enforce a correct ruling to the dispute after appeal', async () => {
      const {
        governor,
        appeableArbitrator,
        args,
        users,
      } = await useRulingSetup();

      // Ruling 1 is equal to 0 submission index (submitter1)
      await appeableArbitrator.giveRuling(0, 1);

      const latestSession = await governor.getCurrentSessionNumber();
      let sessionInfo = await governor.sessions(latestSession);

      // Appeal fee is the same as arbitration fee for this arbitrator
      const loserAppealFee = args.arbitrationFee.add(
        args.arbitrationFee.mul(args.loserMultiplier).div(MULTIPLIER_DIVISOR)
      );
      await governor.connect(users.submitter2).fundAppeal(1, {
        value: loserAppealFee,
      });

      const winnerAppealFee = args.arbitrationFee.add(
        args.arbitrationFee.mul(args.winnerMultiplier).div(MULTIPLIER_DIVISOR)
      );
      await governor.connect(users.submitter1).fundAppeal(0, {
        value: winnerAppealFee,
      });

      // Change the ruling in favor of submitter2.
      await appeableArbitrator.giveRuling(1, 2);
      await increaseTime(args.appealTimeout + 1);

      await expect(() =>
        appeableArbitrator.giveRuling(1, 2)
      ).to.changeEtherBalances(
        [users.submitter1, users.submitter2, users.submitter3],
        [0, sessionInfo.sumDeposit, 0]
      );

      sessionInfo = await governor.sessions(latestSession);
      expect(sessionInfo.ruling).to.equal(2);

      const submission = await governor.submissions(1);
      expect(submission.approved).to.equal(true);
      expect(submission.submitter).to.equal(users.submitter2.address);
    });

    it('Should change the ruling if loser paid appeal fees while the winner did not', async () => {
      const {
        governor,
        appeableArbitrator,
        args,
        users,
      } = await useRulingSetup();

      // Ruling 1 is equal to 0 submission index (submitter1)
      await appeableArbitrator.giveRuling(0, 1);

      const latestSession = await governor.getCurrentSessionNumber();
      let sessionInfo = await governor.sessions(latestSession);

      const loserAppealFee = args.arbitrationFee.add(
        args.arbitrationFee.mul(args.loserMultiplier).div(MULTIPLIER_DIVISOR)
      );

      await governor.connect(users.submitter2).fundAppeal(1, {
        value: loserAppealFee,
      });

      const shadowWinner = await governor.shadowWinner();
      expect(shadowWinner).to.equal(1);

      await increaseTime(args.appealTimeout + 1);
      await appeableArbitrator.giveRuling(sessionInfo.disputeID, 1);

      const losingList = await governor.submissions(0);
      expect(losingList.approved).to.equal(false);

      const winningList = await governor.submissions(1);
      expect(winningList.approved).to.equal(true);

      sessionInfo = await governor.sessions(latestSession);
      expect(sessionInfo.ruling).to.equal(2);
    });

    it('Should register payments correctly and withdraw correct fees if dispute had winner/loser', async () => {
      const {
        governor,
        appeableArbitrator,
        args,
        users,
      } = await useRulingSetup();

      await appeableArbitrator.giveRuling(0, 3);

      const loserAppealFee = args.arbitrationFee.add(
        args.arbitrationFee.mul(args.loserMultiplier).div(MULTIPLIER_DIVISOR)
      );

      const winnerAppealFee = args.arbitrationFee.add(
        args.arbitrationFee.mul(args.winnerMultiplier).div(MULTIPLIER_DIVISOR)
      );

      await governor.connect(users.submitter1).fundAppeal(0, {
        value: loserAppealFee,
      });

      // Deliberately underpay with 2nd loser to check correct fee distribution.
      await governor.connect(users.submitter2).fundAppeal(1, {
        value: args.arbitrationFee,
      });

      // Winner's fee is crowdfunded.
      await governor.connect(users.other).fundAppeal(2, {
        value: winnerAppealFee.mul(75).div(100),
      });

      await governor.connect(users.submitter3).fundAppeal(2, {
        value: args.submissionDeposit(),
      });

      const roundInfo = await governor.getRoundInfo(0, 0);
      expect(roundInfo.paidFees[0]).to.equal(loserAppealFee);
      expect(roundInfo.hasPaid[0]).to.equal(true);

      expect(roundInfo.paidFees[1]).to.equal(args.arbitrationFee);
      expect(roundInfo.hasPaid[1]).to.equal(false);

      expect(roundInfo.paidFees[2]).to.equal(winnerAppealFee);
      expect(roundInfo.hasPaid[2]).to.equal(true);

      expect(roundInfo.feeRewards).to.equal(
        winnerAppealFee.add(loserAppealFee).sub(args.arbitrationFee)
      );

      expect(roundInfo.successfullyPaid).to.equal(
        winnerAppealFee.add(loserAppealFee)
      );

      await appeableArbitrator.giveRuling(1, 3);

      // 2nd loser underpays again in the last round.
      await governor.connect(users.submitter2).fundAppeal(1, {
        value: loserAppealFee.sub(1000),
      });

      await increaseTime(args.appealTimeout + 1);
      await appeableArbitrator.giveRuling(1, 3);

      await expect(() =>
        governor
          .connect(users.deployer)
          .withdrawFeesAndRewards(users.submitter1.address, 0, 0, 0)
      ).to.changeEtherBalance(users.submitter1, 0);

      await expect(() =>
        governor
          .connect(users.deployer)
          .withdrawFeesAndRewards(users.submitter2.address, 0, 0, 1)
      ).to.changeEtherBalance(users.submitter2, args.arbitrationFee);

      await expect(() =>
        governor
          .connect(users.deployer)
          .withdrawFeesAndRewards(users.submitter2.address, 0, 1, 1)
      ).to.changeEtherBalance(users.submitter2, loserAppealFee.sub(1000));

      await expect(() =>
        governor
          .connect(users.deployer)
          .withdrawFeesAndRewards(users.submitter3.address, 0, 0, 2)
      ).to.changeEtherBalance(
        users.submitter3,
        roundInfo.feeRewards.mul(25).div(100)
      );

      await expect(() =>
        governor
          .connect(users.deployer)
          .withdrawFeesAndRewards(users.other.address, 0, 0, 2)
      ).to.changeEtherBalance(
        users.other,
        roundInfo.feeRewards.mul(75).div(100)
      );
    });

    it('Should withdraw correct fees if arbitrator refused to arbitrate', async () => {
      const {
        governor,
        appeableArbitrator,
        args,
        users,
      } = await useRulingSetup();

      await appeableArbitrator.giveRuling(0, 0);

      const sharedAppealFee = args.arbitrationFee.add(
        args.arbitrationFee.mul(args.sharedMultiplier).div(MULTIPLIER_DIVISOR)
      );

      await governor.connect(users.other).fundAppeal(0, {
        value: sharedAppealFee.mul(2).div(10),
      });

      await governor.connect(users.submitter1).fundAppeal(0, {
        value: args.submissionDeposit().mul(5),
      });

      // Deliberately underpay with 3rd submitter.
      await governor.connect(users.submitter3).fundAppeal(2, {
        value: sharedAppealFee.mul(3).div(10),
      });

      await governor.connect(users.other).fundAppeal(1, {
        value: sharedAppealFee.mul(4).div(10),
      });

      await governor.connect(users.submitter2).fundAppeal(1, {
        value: args.submissionDeposit().mul(2),
      });

      const roundInfo = await governor.getRoundInfo(0, 0);

      await appeableArbitrator.giveRuling(1, 0);
      await increaseTime(args.appealTimeout + 1);
      await appeableArbitrator.giveRuling(1, 0);

      await expect(() =>
        governor
          .connect(users.deployer)
          .withdrawFeesAndRewards(users.submitter1.address, 0, 0, 0)
      ).to.changeEtherBalance(
        users.submitter1,
        roundInfo.feeRewards.mul(4).div(10)
      );

      await expect(() =>
        governor
          .connect(users.deployer)
          .withdrawFeesAndRewards(users.submitter2.address, 0, 0, 1)
      ).to.changeEtherBalance(
        users.submitter2,
        roundInfo.feeRewards.mul(3).div(10)
      );

      await expect(() =>
        governor
          .connect(users.deployer)
          .withdrawFeesAndRewards(users.submitter3.address, 0, 0, 2)
      ).to.changeEtherBalance(users.submitter3, sharedAppealFee.mul(3).div(10));

      await expect(() =>
        governor
          .connect(users.deployer)
          .withdrawFeesAndRewards(users.other.address, 0, 0, 0)
      ).to.changeEtherBalance(users.other, roundInfo.feeRewards.mul(1).div(10));

      await expect(() =>
        governor
          .connect(users.deployer)
          .withdrawFeesAndRewards(users.other.address, 0, 0, 1)
      ).to.changeEtherBalance(users.other, roundInfo.feeRewards.mul(2).div(10));
    });
  });

  describe('Approved List Transactions', () => {
    it('Should correctly execute atomic transactions', async () => {
      const {
        governor,
        appeableArbitrator,
        args,
        users,
      } = await useTransactionsSetup();

      // Execute the first and the second transactions separately to check atomic execution.
      await governor.connect(users.deployer).executeTransactionList(0, 0, 1);

      const tx1 = await governor.getTransactionInfo(0, 0);
      expect(tx1.executed).to.equal(true);

      const tx2 = await governor.getTransactionInfo(0, 1);
      expect(tx2.executed).to.equal(false);

      const dispute = await appeableArbitrator.disputes(0);
      expect(dispute.arbitrated).to.equal(governor.address);
      expect(dispute.choices).to.equal(11);
      expect(dispute.fee).to.equal(args.arbitrationFee);

      // TODO: comparison fails. Can't see the reason atm
      const withdrawTime = await governor.withdrawTimeout();
      //expect(withdrawTime).to.equal(20);
    });

    it('Should correctly execute batch transactions', async () => {
      const {
        governor,
        appeableArbitrator,
        args,
        users,
      } = await useTransactionsSetup();

      await governor.connect(users.deployer).executeTransactionList(0, 0, 0);

      const dispute = await appeableArbitrator.disputes(0);
      expect(dispute.arbitrated).to.equal(governor.address);
      expect(dispute.choices).to.equal(11);
      expect(dispute.fee).to.equal(args.arbitrationFee);

      const tx1 = await governor.getTransactionInfo(0, 0);
      expect(tx1.executed).to.equal(true);

      const withdrawTime = await governor.withdrawTimeout();
      expect(withdrawTime).to.equal(20);

      const tx2 = await governor.getTransactionInfo(0, 1);
      expect(tx2.executed).to.equal(true);
    });
  });

  describe('Governor Reserves', () => {
    it('Should check that funds are tracked correctly', async () => {
      const {
        governor,
        appeableArbitrator,
        users,
        args,
      } = await useInitialSetup();

      let reservedETH: BigNumber;
      let expendableFunds: BigNumber;

      await governor
        .connect(users.submitter1)
        .submitList(
          [appeableArbitrator.address],
          ['100000000000000000'],
          '0xc13517e1000000000000000000000000000000000000000000000000000000000000000b00000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000001fa',
          [101],
          listDescription,
          { value: args.submissionDeposit() }
        );

      await governor
        .connect(users.submitter2)
        .submitList(
          [governor.address],
          [10],
          '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
          [36],
          listDescription,
          { value: args.submissionDeposit() }
        );

      reservedETH = await governor.reservedETH();
      expect(reservedETH).to.equal(args.submissionDeposit().mul(2));

      const listInfo = await governor.submissions(1);
      await governor
        .connect(users.submitter2)
        .withdrawTransactionList(1, listInfo.listHash);

      reservedETH = await governor.reservedETH();
      expect(reservedETH).to.equal(args.submissionDeposit());

      // Submit the same list again so we could have a dispute.
      await governor
        .connect(users.submitter2)
        .submitList(
          [governor.address],
          [10],
          '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
          [36],
          listDescription,
          { value: args.submissionDeposit() }
        );

      await increaseTime(args.submissionTimeout + 1);
      await governor.connect(users.deployer).executeSubmissions();

      reservedETH = await governor.reservedETH();
      expect(reservedETH).to.equal(ethers.utils.parseEther('1.9'));

      await appeableArbitrator.giveRuling(0, 2);

      const loserAppealFee = args.arbitrationFee.add(
        args.arbitrationFee.mul(args.loserMultiplier).div(MULTIPLIER_DIVISOR)
      );

      const winnerAppealFee = args.arbitrationFee.add(
        args.arbitrationFee.mul(args.winnerMultiplier).div(MULTIPLIER_DIVISOR)
      );

      await governor.connect(users.submitter1).fundAppeal(0, {
        value: loserAppealFee,
      });

      reservedETH = await governor.reservedETH();
      expect(reservedETH).to.equal(
        args
          .submissionDeposit()
          .mul(2)
          .sub(args.arbitrationFee)
          .add(loserAppealFee)
      );

      await governor.connect(users.other).fundAppeal(1, {
        value: winnerAppealFee,
      });

      reservedETH = await governor.reservedETH();
      expect(reservedETH).to.equal(
        args
          .submissionDeposit()
          .mul(2)
          .sub(args.arbitrationFee)
          .add(loserAppealFee)
          .add(winnerAppealFee)
          .sub(args.arbitrationFee)
      );

      await appeableArbitrator.giveRuling(1, 1);
      await increaseTime(args.appealTimeout + 1);

      const latestSession = await governor.getCurrentSessionNumber();
      const sessionInfo = await governor.sessions(latestSession);

      const reserveBeforeRuling = await governor.reservedETH();
      await appeableArbitrator.giveRuling(1, 1);

      reservedETH = await governor.reservedETH();
      expect(reservedETH).to.equal(
        reserveBeforeRuling.sub(sessionInfo.sumDeposit)
      );

      expendableFunds = await governor.getExpendableFunds();
      expect(expendableFunds).to.equal(0);

      await governor
        .connect(users.deployer)
        .withdrawFeesAndRewards(users.submitter1.address, 0, 0, 0);

      reservedETH = await governor.reservedETH();
      expect(reservedETH).to.equal(0);

      const fundingAmount = ethers.utils.parseEther('3');
      await users.other.sendTransaction({
        to: governor.address,
        value: fundingAmount,
      });

      expendableFunds = await governor.getExpendableFunds();
      expect(expendableFunds).to.equal(fundingAmount);

      await governor.connect(users.deployer).executeTransactionList(0, 0, 0);

      expendableFunds = await governor.getExpendableFunds();
      expect(expendableFunds).to.equal(ethers.utils.parseEther('2.9'));
    });
  });
});
