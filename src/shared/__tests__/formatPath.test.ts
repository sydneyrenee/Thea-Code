// npx jest src/shared/__tests__/formatPath.test.ts
import { formatPath } from "../formatPath"

describe("formatPath", () => {
    it("adds leading backslash on Windows", () => {
        const result = formatPath("folder/file", "win32")
        expect(result).toBe("\\folder/file")
    })

    it("preserves existing leading separator", () => {
        const result = formatPath("/already", "darwin")
        expect(result).toBe("/already")
    })

    it("escapes spaces according to platform", () => {
        expect(formatPath("my file", "win32")).toBe("\\my/ file")
        expect(formatPath("my file", "linux")).toBe("/my\\ file")
    })

    it("can skip space escaping", () => {
        const result = formatPath("my file", "win32", false)
        expect(result).toBe("\\my file")
    })
})
