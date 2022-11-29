import { ethers, deployments } from "hardhat";
import { expect } from "chai";
import { ExposedSortitionSumTreeFactory } from "../../typechain-types";

describe("SortitionSumTreeFactory", () => {
  it("Should successfully keep track of ID ownership of values and draw them from the tree appropriately.", async () => {
    await deployments.fixture(["SortitionSumTreeFactory", "ExposedSortitionSumTreeFactory"], {
      fallbackToGlobal: true,
    });
    const sortitionSumTreeFactory = (await ethers.getContract(
      "ExposedSortitionSumTreeFactory"
    )) as ExposedSortitionSumTreeFactory;

    // Create tree and populate with 4 candidates
    const tree = { K: 2, key: ethers.utils.hexZeroPad("0x01", 32) };
    const candidates = {
      ali: {
        ID: "0x0000000000000000000000000000000000000000000000000000000000000002",
        treeIndex: 0,
        value: 15,
      },
      bob: {
        ID: "0x0000000000000000000000000000000000000000000000000000000000000004",
        treeIndex: 0,
        value: 5,
      },
      carl: {
        ID: "0x0000000000000000000000000000000000000000000000000000000000000001",
        treeIndex: 0,
        value: 10,
      },
      deli: {
        ID: "0x0000000000000000000000000000000000000000000000000000000000000003",
        treeIndex: 0,
        value: 20,
      },
    };

    await sortitionSumTreeFactory._createTree(tree.key, tree.K);

    for (const candidate of Object.values(candidates))
      await sortitionSumTreeFactory._set(tree.key, candidate.value, candidate.ID);

    expect(await sortitionSumTreeFactory._draw(tree.key, 13)).to.be.equal(candidates.ali.ID);
    expect(await sortitionSumTreeFactory._draw(tree.key, 27)).to.be.equal(candidates.deli.ID);

    // Set carl to 14 to draw her with 13 and then set her back to 10 to draw ali again
    await sortitionSumTreeFactory._set(tree.key, 14, candidates.carl.ID);
    expect(await sortitionSumTreeFactory._draw(tree.key, 13)).to.be.equal(candidates.carl.ID);
    await sortitionSumTreeFactory._set(tree.key, 10, candidates.carl.ID);
    expect(await sortitionSumTreeFactory._draw(tree.key, 13)).to.be.equal(candidates.ali.ID);

    // Remove deli to draw bob with 27 and add him back in to draw him again
    await sortitionSumTreeFactory._set(tree.key, 0, candidates.deli.ID);
    expect(await sortitionSumTreeFactory._draw(tree.key, 27)).to.be.equal(candidates.bob.ID);

    await sortitionSumTreeFactory._set(tree.key, candidates.deli.value, candidates.deli.ID);
    expect(await sortitionSumTreeFactory._draw(tree.key, 27)).to.equal(candidates.deli.ID);

    // Test stake view
    for (const candidate of Object.values(candidates)) {
      const stakeOfCandiate = await sortitionSumTreeFactory._stakeOf(tree.key, candidate.ID);
      expect(stakeOfCandiate).to.deep.equal(candidate.value);
    }
  });
});
