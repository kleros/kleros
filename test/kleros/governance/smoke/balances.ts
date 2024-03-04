import { expect } from "chai";
import { useInitialSetup, useListSubmissionSetup } from "utils/fixtures/kleros-governor";
import { increaseTime } from "utils/test-helpers";

describe("Smoke: Governor - Balances", () => {
  const listDescription = "tx1, tx2, tx3";
  it("Should correctly change balances on list submission", async () => {
    const { governor, args, users } = await useInitialSetup();

    await expect(() =>
      governor.connect(users.submitter1).submitList([governor.address], [10], "0xfdea", [2], listDescription, {
        value: args.submissionDeposit(),
      })
    ).to.changeEtherBalance(users.submitter1, args.submissionDeposit().mul(-1));

    const latestSession = await governor.getCurrentSessionNumber();
    let sessionInfo = await governor.sessions(latestSession);
    expect(sessionInfo.sumDeposit, "The sum of the deposits is incorrect").to.equal(args.submissionDeposit());
  });

  it("should correctly change balance on submission execution", async () => {
    const { governor, args, users } = await useListSubmissionSetup();
    await increaseTime(args.submissionTimeout + 1);

    await expect(() => governor.connect(users.deployer).executeSubmissions()).to.changeEtherBalance(
      users.submitter1,
      args.submissionDeposit()
    );

    const latestSession = await governor.getCurrentSessionNumber();
    let sessionInfo = await governor.sessions(latestSession);
    expect(sessionInfo.sumDeposit, "The sum of the deposits should be set to 0 right after approval").to.equal(0);
  });

  it("Should correctly change balance on submission withdrawl", async () => {
    const { governor, args, users } = await useListSubmissionSetup();

    const listInfo = await governor.submissions(0);
    await expect(() =>
      governor.connect(users.submitter1).withdrawTransactionList(0, listInfo.listHash)
    ).to.changeEtherBalance(users.submitter1, args.submissionDeposit());

    const latestSession = await governor.getCurrentSessionNumber();
    const sessionInfo = await governor.sessions(latestSession);
    expect(sessionInfo.sumDeposit, "The sum of the deposits should be set to 0 right after withdrawl").to.equal(0);
  });
});
