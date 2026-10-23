import { expect }       from "@hapi/code"
import { execFileSync } from "child_process"
import { join }         from "path"
import pkg              from "../package.json"


describe("CLI", function () {

    this.timeout(30000)

    it ("--version prints the version from package.json", () => {
        const output = execFileSync(process.execPath, [
            require.resolve("ts-node/dist/bin.js"),
            "./src/app.ts",
            "--version"
        ], {
            cwd: join(__dirname, ".."),
            env: {
                ...process.env,
                // See invoke() in ./lib.ts
                TS_NODE_PROJECT: undefined,
                TS_NODE_TRANSPILE_ONLY: "true"
            }
        })
        expect(String(output).trim()).to.equal(pkg.version)
    })
})
