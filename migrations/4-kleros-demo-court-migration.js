const KlerosDemoCourt = artifacts.require("./kleros/KlerosDemoCourt.sol");

module.exports = function (deployer) {
    deployer.deploy(SortitionSumTreeFactory);
    deployer.link(SortitionSumTreeFactory, [
        ExposedSortitionSumTreeFactory,
        KlerosLiquid,
    ]);
};
