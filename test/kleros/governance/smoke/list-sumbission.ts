import { expect } from 'chai';
import { BytesLike, BigNumber } from 'ethers';
import { soliditySha3 } from 'web3-utils';

import { PromiseOrValue } from 'typechain-types/common';
import { TransactionInfo, HashType } from 'utils';
import {
  useInitialSetup,
  useListSubmissionSetup,
} from 'utils/fixtures/kleros-governor';
import { increaseTime } from 'utils/test-helpers';

describe('Smoke: Governor - List Submission', () => {
  const listDescription = 'tx1, tx2, tx3';

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
    const values = [10, BigNumber.from(1).pow(17)];
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
        BigNumber.from(1)
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
    expect(submission.deposit, 'The deposit of the list is incorrect').to.equal(
      args.submissionDeposit()
    );

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
      hash2 = soliditySha3(txs[1].target, txs[1].value.toNumber(), txs[1].data);
    } else {
      hash1 = soliditySha3(
        soliditySha3(
          txs[1].target,
          txs[1].value.toNumber(),
          txs[1].data
        ) as string,
        0
      );
      hash2 = soliditySha3(txs[0].target, txs[0].value.toNumber(), txs[0].data);
    }

    const listHash = soliditySha3(hash2 as string, hash1 as string);
    expect(submission[2], 'The list hash is incorrect').to.equal(listHash);

    await increaseTime(args.submissionTimeout + 1);
    await expect(
      governor
        .connect(users.submitter2)
        .submitList([governor.address], [100], '0xfdea', [2], listDescription, {
          value: args.submissionDeposit(),
        })
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
    expect(submittedLists.length, 'The submission count is incorrect').to.equal(
      2
    );

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
    expect(submittedLists.length, 'The submission count is incorrect').to.equal(
      1
    );

    sessionInfo = await governor.sessions(0);
    expect(
      sessionInfo.sumDeposit,
      'The sum of submission deposit is incorrect'
    ).to.equal(args.submissionDeposit());
  });

  describe('Revert Execution', () => {
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
        .submitList([governor.address], [10], '0xfdea', [2], listDescription, {
          value: args.submissionDeposit(),
        });

      await increaseTime(11);
      const listInfo = await governor.submissions(0);

      await expect(
        governor
          .connect(users.submitter1)
          .withdrawTransactionList(0, listInfo.listHash)
      ).to.be.reverted;
    });
  });
});
