const { once } = require("node:events");

async function startServer(testContext, app) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  testContext.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  const address = server.address();

  return `http://127.0.0.1:${address.port}`;
}

module.exports = {
  startServer,
};
