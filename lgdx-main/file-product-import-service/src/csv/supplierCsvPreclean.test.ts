import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { streamSupplierCsvPreclean } from "./supplierCsvPreclean";

describe("supplierCsvPreclean", () => {
  it("streamSupplierCsvPreclean drops columns and filters like clean_csv.py", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "preclean-test-"));
    const input = path.join(dir, "in.csv");
    const output = path.join(dir, "out.csv");
    const csv = [
      "Image,Video,Color,Clarity,CustAmount,Rapaport,Discount",
      "http://i,,D,VS1,100,dropme,5",
      ",,E,VVS2,200,xx,1",
      "http://x,,H,VS1,300,xx,1",
      "http://a,http://b,F,IF,400,xx,1",
    ].join("\n");
    await fs.writeFile(input, csv, "utf8");

    const { rowsOut } = await streamSupplierCsvPreclean(input, output);
    expect(rowsOut).toBe(2);

    const out = await fs.readFile(output, "utf8");
    const lines = out.trim().split("\n");
    expect(lines[0]).toBe("Image,Video,Color,Clarity,Price");
    expect(lines[1]).toContain("http://i");
    expect(lines[2]).toContain("http://a");
    await fs.rm(dir, { recursive: true, force: true });
  });
});
