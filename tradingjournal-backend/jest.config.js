/**
 * ค่าเริ่มต้นของ Nest สำหรับ unit test (เดิมอยู่ใน package.json แต่หายไป
 * พร้อมกับ devDependencies ของ jest — ไฟล์ .spec.ts เลยรันไม่ได้มาสักพัก)
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: {
          // spec ใช้ decorator ของ Nest เหมือนโค้ดจริง
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
        },
      },
    ],
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};
