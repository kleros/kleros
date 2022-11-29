import { expect } from "chai";
import { useInitialSetup } from "utils/fixtures/kleros-governor";

describe("Smoke: KlerosGovernor", () => {
  describe("Construction", () => {
    it("Should set state variables correctly", async () => {
      const { appeableArbitrator, governor, args } = await useInitialSetup();

      expect(await governor.arbitrator()).to.equal(appeableArbitrator.address);
      expect(await governor.arbitratorExtraData()).to.equal(args.arbitratorExtraData);
      expect(await governor.submissionTimeout()).to.equal(args.submissionTimeout);
      expect(await governor.executionTimeout()).to.equal(args.executionTimeout);
      expect(await governor.withdrawTimeout()).to.equal(args.withdrawTimeout);
      expect(await governor.sharedMultiplier()).to.equal(args.sharedMultiplier);
      expect(await governor.winnerMultiplier()).to.equal(args.winnerMultiplier);
      expect(await governor.loserMultiplier()).to.equal(args.loserMultiplier);
      expect(await governor.getCurrentSessionNumber()).to.equal(0);
      expect(await governor.submissionBaseDeposit()).to.equal(args.submissionBaseDeposit);
    });
  });
});
