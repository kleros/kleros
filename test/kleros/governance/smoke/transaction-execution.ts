import { expect } from "chai";
import { ethers } from "ethers";
import { useListSubmissionSetup, useTransactionsSetup } from "utils/fixtures/kleros-governor";
import { increaseTime } from "utils/test-helpers";

describe("Smoke: Governor - Approved List Transactions", () => {
  it("Should correctly execute atomic transactions", async () => {
    const { governor, appeableArbitrator, args, users } = await useTransactionsSetup();

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
  });

  it("Should correctly execute batch transactions", async () => {
    const { governor, appeableArbitrator, args, users } = await useTransactionsSetup();

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

  describe("Revert Execution", () => {
    it("Should fail after the execution timeout", async () => {
      const { governor, args, users } = await useListSubmissionSetup();

      await increaseTime(args.submissionTimeout + 1);
      await governor.connect(users.deployer).executeSubmissions();

      users.other.sendTransaction({
        to: governor.address,
        value: ethers.utils.parseEther("3"),
      });

      await increaseTime(args.executionTimeout + 1);
      await expect(governor.connect(users.deployer).executeTransactionList(0, 0, 0)).to.be.reverted;
    });
  });
});
