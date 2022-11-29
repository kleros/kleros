import { ethers } from "hardhat";
import { expect } from "chai";

import { asyncForEach } from "utils/test-helpers";
import { SubcourtInfo } from "utils/interfaces";

import { setup } from "../setups";

describe("Smoke: Court Tree", () => {
  describe("Construction", () => {
    it("Should create subcourts under specified parent court", async () => {
      const { klerosLiquid, subcourtMap } = await setup();

      await asyncForEach(async (subcourt: SubcourtInfo) => {
        const court = await klerosLiquid.courts(subcourt.ID);
        expect([...court]).to.deep.equal([
          subcourt.parent,
          subcourt.hiddenVotes,
          subcourt.minStake,
          subcourt.alpha,
          subcourt.feeForJuror,
          subcourt.jurorsForCourtJump,
        ]);
      }, subcourtMap);
    });
  });
  describe("Subcourt Setters", () => {
    it("Should set new minimum stake", async () => {
      const { klerosLiquid, users } = await setup();

      const court = await klerosLiquid.getSubcourt(0);

      const newMinStake = 700;
      await klerosLiquid.connect(users.governor).changeSubcourtMinStake(court.children[0], newMinStake);

      const subcourt = await klerosLiquid.courts(court.children[0]);
      expect(subcourt.minStake).to.equal(newMinStake);
    });

    it("Should set new alpha", async () => {
      const { klerosLiquid, users } = await setup();

      const court = await klerosLiquid.getSubcourt(0);

      const newAlpha = 100;
      await klerosLiquid.connect(users.governor).changeSubcourtAlpha(court.children[0], newAlpha);

      const subcourt = await klerosLiquid.courts(court.children[0]);
      expect(subcourt.alpha).to.equal(newAlpha);
    });

    it("Should set new juror fee", async () => {
      const { klerosLiquid, users } = await setup();

      const court = await klerosLiquid.getSubcourt(0);

      const newJurorFee = ethers.utils.parseEther("1");
      await klerosLiquid.connect(users.governor).changeSubcourtJurorFee(court.children[0], newJurorFee);

      const subcourt = await klerosLiquid.courts(court.children[0]);
      expect(subcourt.feeForJuror).to.equal(newJurorFee);
    });

    it("Should set new number of jurors for court jump", async () => {
      const { klerosLiquid, users } = await setup();

      const court = await klerosLiquid.getSubcourt(0);

      const newJurorsForCourtJump = 400;
      await klerosLiquid.connect(users.governor).changeSubcourtJurorsForJump(court.children[0], newJurorsForCourtJump);

      const subcourt = await klerosLiquid.courts(court.children[0]);
      expect(subcourt.jurorsForCourtJump).to.equal(newJurorsForCourtJump);
    });

    it("Should set new times per period", async () => {
      const { klerosLiquid, users } = await setup();

      const court = await klerosLiquid.getSubcourt(0);

      const newTimesPerPeriod = [100, 1000, 1000, 1000]; // TODO: cant figure out how to cast the Type
      await klerosLiquid
        .connect(users.governor)
        .changeSubcourtTimesPerPeriod(court.children[0], [100, 1000, 1000, 1000]);

      const subcourt = await klerosLiquid.getSubcourt(court.children[0]);
      expect(subcourt.timesPerPeriod).to.deep.equal(newTimesPerPeriod);
    });
  });
  describe("Revert Execution", () => {
    it("Should fail to create subcourt with lower minStake than in its parent", async () => {
      const { klerosLiquid, subcourtTree } = await setup();

      await expect(
        klerosLiquid.createSubcourt(
          subcourtTree.parent,
          subcourtTree.hiddenVotes,
          subcourtTree.minStake.sub(1),
          subcourtTree.alpha,
          subcourtTree.feeForJuror,
          subcourtTree.jurorsForCourtJump,
          subcourtTree.timesPerPeriod,
          subcourtTree.sortitionSumTreeK
        )
      ).to.be.reverted;
    });

    it("Should fail to set new subcourt minStake to lower value than in its parent", async () => {
      const { klerosLiquid, subcourtTree } = await setup();
      const subcourt = subcourtTree.children[0];

      await expect(klerosLiquid.changeSubcourtMinStake(subcourt.ID, subcourtTree.minStake.sub(1))).to.be.reverted;
    });

    it("Should fail to set new subcourt minStake to higher value than in its child", async () => {
      const { klerosLiquid, subcourtTree } = await setup();

      await expect(klerosLiquid.changeSubcourtMinStake(subcourtTree.ID, subcourtTree.minStake.add(1))).to.be.reverted;
    });
  });
});
