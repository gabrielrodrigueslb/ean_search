import prismaClientModule from "@prisma/client";

const { PrismaClient } = prismaClientModule;
const prisma = new PrismaClient();

export default prisma;
