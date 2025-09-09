import { expect } from "chai";
import { ethers } from "hardhat";

describe("RubySwapRouter refundETH edges", function () {
	it("does nothing when no ETH balance; refunds when balance > 0", async function () {
		const [deployer, user] = await ethers.getSigners();
		const Timelock = await ethers.getContractFactory("RubySwapTimelock");
		const tl = await Timelock.deploy([deployer.address],[deployer.address],deployer.address); await tl.waitForDeployment();
		const Factory = await ethers.getContractFactory("RubySwapFactory");
		const factory = await Factory.deploy(await tl.getAddress()); await factory.waitForDeployment();
		const Router = await ethers.getContractFactory("RubySwapRouter");
		const router = await Router.deploy(await factory.getAddress(), ethers.ZeroAddress); await router.waitForDeployment();

		// No ETH in router - should just return
		await expect(router.refundETH({ value: 0 })).to.not.be.reverted;

		// Send ETH to router and ensure refund sends it back to caller
		await user.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("1") });
		const before = await ethers.provider.getBalance(await user.getAddress());
		const tx = await router.connect(user).refundETH({ value: 0 });
		const rc = await tx.wait();
		const gas = rc!.gasUsed * rc!.gasPrice!;
		const after = await ethers.provider.getBalance(await user.getAddress());
		expect(after + gas).to.be.gt(before);
	});
}); 