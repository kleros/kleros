import { expect } from "chai";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

import { setup, useDisputeSetup } from "../setups";
import { increaseTime } from "utils/test-helpers";
import { Phase } from "utils";

describe("Smoke: Dispute - Staking", () => {
  it("Should set stakes in subcourt", async () => {
    const { klerosLiquid, pnk, subcourt, users } = await setup();

    await pnk.generateTokens(users.governor.address, subcourt.minStake);

    await expect(klerosLiquid.setStake(subcourt.ID, subcourt.minStake))
      .to.emit(klerosLiquid, "StakeSet")
      .withArgs(users.governor.address, subcourt.ID, subcourt.minStake, anyValue);
  });

  it("Should check juror records after staking", async () => {
    const { klerosLiquid, pnk, subcourt, users } = await setup();

    await pnk.generateTokens(users.other.address, subcourt.minStake);

    await klerosLiquid.connect(users.other).setStake(subcourt.ID, subcourt.minStake);

    const jurorSubcourtID = await klerosLiquid.getJuror(users.other.address);
    expect(Number(jurorSubcourtID)).to.be.equal(subcourt.ID);

    const jurorStake = await klerosLiquid.stakeOf(users.other.address, Number(jurorSubcourtID));
    expect(jurorStake).to.be.equal(subcourt.minStake);
  });

  it("Should execute delayed set stakes", async () => {
    const { klerosLiquid, pnk, subcourt, users } = await useDisputeSetup();

    await pnk.generateTokens(users.governor.address, subcourt.minStake);

    const minStakingTime = await klerosLiquid.minStakingTime();
    await increaseTime(minStakingTime.toNumber());

    await klerosLiquid.passPhase();
    await klerosLiquid.setStake(subcourt.ID, subcourt.minStake);

    const lastDelayedStake = await klerosLiquid.lastDelayedSetStake();
    expect(lastDelayedStake).to.be.equal(1);

    const maxDrawingTime = await klerosLiquid.maxDrawingTime();
    await klerosLiquid.passPhase();
    await increaseTime(maxDrawingTime.toNumber());

    let juror = await klerosLiquid.jurors(users.governor.address);
    expect(juror.stakedTokens).to.be.equal(0);

    await klerosLiquid.passPhase();
    await klerosLiquid.executeDelayedSetStakes(1);

    juror = await klerosLiquid.jurors(users.governor.address);
    expect(juror.stakedTokens).to.be.equal(subcourt.minStake);
  });

  describe("Revert Execution", () => {
    it("Should fail to set stake less than required minStake", async () => {
      const { klerosLiquid, pnk, subcourt, users } = await setup();

      await pnk.generateTokens(users.governor.address, subcourt.minStake);

      await expect(klerosLiquid.setStake(subcourt.ID, subcourt.minStake.sub(1))).to.be.reverted;
    });

    it("Should fail staking not during Staking phase", async () => {
      const { klerosLiquid, pnk, subcourt, users } = await useDisputeSetup();

      await pnk.generateTokens(users.governor.address, subcourt.minStake);

      const minStakingTime = await klerosLiquid.minStakingTime();
      await increaseTime(minStakingTime.toNumber());

      await expect(klerosLiquid.passPhase()).to.emit(klerosLiquid, "NewPhase").withArgs(Phase.generating);

      await klerosLiquid.setStake(subcourt.ID, subcourt.minStake);
      await expect(klerosLiquid.executeDelayedSetStakes(1)).to.be.reverted;

      await expect(klerosLiquid.passPhase()).to.emit(klerosLiquid, "NewPhase").withArgs(Phase.drawing);

      await expect(klerosLiquid.executeDelayedSetStakes(1)).to.be.reverted;
    });
  });
});
