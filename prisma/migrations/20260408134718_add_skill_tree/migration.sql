-- CreateTable
CREATE TABLE "SkillTree" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "templateKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillTree_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillNode" (
    "id" SERIAL NOT NULL,
    "skillTreeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "SkillNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodeEdge" (
    "id" SERIAL NOT NULL,
    "skillTreeId" INTEGER NOT NULL,
    "fromNodeId" INTEGER NOT NULL,
    "toNodeId" INTEGER NOT NULL,

    CONSTRAINT "NodeEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodeAssignment" (
    "id" SERIAL NOT NULL,
    "nodeId" INTEGER NOT NULL,
    "todoId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NodeAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SkillTree_userId_idx" ON "SkillTree"("userId");

-- CreateIndex
CREATE INDEX "SkillNode_skillTreeId_idx" ON "SkillNode"("skillTreeId");

-- CreateIndex
CREATE INDEX "NodeEdge_skillTreeId_idx" ON "NodeEdge"("skillTreeId");

-- CreateIndex
CREATE UNIQUE INDEX "NodeEdge_fromNodeId_toNodeId_key" ON "NodeEdge"("fromNodeId", "toNodeId");

-- CreateIndex
CREATE INDEX "NodeAssignment_nodeId_idx" ON "NodeAssignment"("nodeId");

-- CreateIndex
CREATE INDEX "NodeAssignment_todoId_idx" ON "NodeAssignment"("todoId");

-- CreateIndex
CREATE UNIQUE INDEX "NodeAssignment_nodeId_todoId_key" ON "NodeAssignment"("nodeId", "todoId");

-- AddForeignKey
ALTER TABLE "SkillTree" ADD CONSTRAINT "SkillTree_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillNode" ADD CONSTRAINT "SkillNode_skillTreeId_fkey" FOREIGN KEY ("skillTreeId") REFERENCES "SkillTree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeEdge" ADD CONSTRAINT "NodeEdge_skillTreeId_fkey" FOREIGN KEY ("skillTreeId") REFERENCES "SkillTree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeEdge" ADD CONSTRAINT "NodeEdge_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "SkillNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeEdge" ADD CONSTRAINT "NodeEdge_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "SkillNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeAssignment" ADD CONSTRAINT "NodeAssignment_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "SkillNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeAssignment" ADD CONSTRAINT "NodeAssignment_todoId_fkey" FOREIGN KEY ("todoId") REFERENCES "Todo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
