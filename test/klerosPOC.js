const { expectThrow, waitForMined, increaseTime } = require('kleros-interaction/helpers/utils')
const KlerosPOC = artifacts.require('./KlerosPOC.sol')
const Pinakion = artifacts.require('./PinakionPOC.sol')
const ArbitrableTransaction = artifacts.require('kleros-interaction/ArbitrableTransaction.sol')
const ConstantRandom = artifacts.require('kleros-interaction/ConstantNG.sol')

contract('KlerosPOC', function(accounts) {
    
    let creator = accounts[0]
    let jurorA   = accounts[0]
    
    // Constructor
    it("Should create the contract with the initial values", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let rng       = await ConstantRandom.new({from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,rng.address,[2,4,8,2,5],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        
        assert.equal(await klerosPOC.pinakion(), pinakion.address, "The PNK address did not setup properly.")
        assert.equal(await klerosPOC.rng(), rng.address, "The RNG address did not setup properly.")
        assert.equal(await klerosPOC.timePerPeriod(2), 8, "The time period did not setup properly.")
    })
    
    // deposit TODO
    it("Should deposit tokens to the contract", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let rng       = await ConstantRandom.new({from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,rng.address,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:1e18})
        await klerosPOC.withdraw(0.8e18,{from:jurorA})
        await pinakion.deposit(0.4e18,{from:jurorA})

        assert.equal((await klerosPOC.jurors(jurorA))[0].toNumber(), 0.6e18, "The juror don't have the correct amount of PNK in Kleros.")
        assert.equal((await pinakion.balanceOf(jurorA)).toNumber(), 0.4e18, "The juror don't have the correct amount of PNK in the token contract.")
    })
    
    // withdraw
    it("Should decrease the balance in the kleros contract and increase it in the pinakion contract", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let rng       = await ConstantRandom.new({from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,rng.address,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:1e18})
        await klerosPOC.withdraw(0.8e18,{from:jurorA})
        
        assert.equal((await klerosPOC.jurors(jurorA))[0], 0.2e18, "The juror don't have the correct amount of PNK in Kleros.")
        assert.equal((await pinakion.balanceOf(jurorA)), 0.8e18, "The juror don't have the correct amount of PNK in the token contract.")
    })
    
    it("Should not be possible to withdraw more than what we have", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,0x0,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:1e18})
        
        await expectThrow(klerosPOC.withdraw(1.8e18,{from:jurorA}))
    })
    
    // buyPinakion
    it("Should increase the balance of the juror", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,0x0,[0,0,0,0,0],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        await klerosPOC.buyPinakion({from:jurorA,value:1e18})     
        
        assert.equal((await klerosPOC.jurors(jurorA))[0], 1e18, "The juror don't have the correct amount of PNK in Kleros.")
    })
    
    // 
    
    
    
    
})