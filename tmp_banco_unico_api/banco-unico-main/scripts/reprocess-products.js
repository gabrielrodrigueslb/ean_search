const { closePool } = require("../src/db");
const { reprocessProducts } = require("../src/modules/products/products.service");

function readCliOption(name) {
  const exactPrefix = `--${name}=`;
  const args = process.argv.slice(2);

  for (const [index, argument] of args.entries()) {
    if (argument.startsWith(exactPrefix)) {
      return argument.slice(exactPrefix.length);
    }

    if (argument === `--${name}`) {
      return args[index + 1];
    }
  }

  return undefined;
}

async function main() {
  const result = await reprocessProducts({
    limit: readCliOption("limit"),
    readBatchSize: readCliOption("read-batch-size"),
    writeBatchSize: readCliOption("write-batch-size"),
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error("Falha ao reprocessar produtos:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
