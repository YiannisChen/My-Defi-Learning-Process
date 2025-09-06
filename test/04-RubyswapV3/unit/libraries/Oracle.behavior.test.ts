import { expect } from "chai";
import { ethers } from "hardhat";

describe("Oracle library via OracleTester", function () {
    it("initialize, grow, write, observeSingle(0), observeSingle(>0), observe; errors I and OLD", async () => {
        const Tester = await ethers.getContractFactory("OracleTester");
        const tester = await Tester.deploy();
        await tester.waitForDeployment();

        // initialize
        await tester.initialize(1000);
        expect(await tester.cardinality()).to.equal(1);
        expect(await tester.cardinalityNext()).to.equal(1);

        // grow to 5
        await tester.grow(5);
        expect(await tester.cardinalityNext()).to.equal(5);

        // write a few observations
        await tester.write(1010, 0, 1000);
        await tester.write(1020, 10, 1000);
        await tester.write(1030, -5, 1000);

        // observeSingle now (secondsAgo=0)
        const [tcNow, splNow] = await tester.observeSingle(1030, 0, 0, 1000);
        expect(tcNow).to.be.a("bigint");
        expect(splNow).to.be.a("bigint");

        // observeSingle 10s ago
        const [tcPast, splPast] = await tester.observeSingle(1030, 10, 0, 1000);
        expect(tcPast).to.be.a("bigint");
        expect(splPast).to.be.a("bigint");

        // observe multiple
        const [tcs, spls] = await tester.observe(1030, [0, 5, 10], 0, 1000);
        expect(tcs.length).to.equal(3);
        expect(spls.length).to.equal(3);

        // error I: force cardinality=0 via unsafe helper
        await expect(tester.observeUnsafe(1000, [0], 0, 0, 0, 0)).to.be.revertedWith("I");

        // error OLD: query older than oldest observation using a fresh instance
        const fresh = await Tester.deploy();
        await fresh.waitForDeployment();
        await fresh.initialize(2000);
        await fresh.write(2010, 0, 1000);
        await expect(fresh.observeSingle(2015, 20, 0, 1000)).to.be.revertedWith("OLD");
    });
}); 