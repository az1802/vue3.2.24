
### 源码文件结构结构

├── packages
│   ├── compiler-core     # 与平台无关的编译器实现的核心函数包
│   ├── compiler-dom      # 浏览器相关的编译器上层内容
│   ├── compiler-sfc      # 单文件组件的编译器
│   ├── compiler-ssr      # 服务端渲染相关的编译器实现
│   ├── global.d.ts       # ts 相关一些声明文件
│   ├── reactivity        # 响应式核心包
│   ├── runtime-core      # 与平台无关的渲染器相关的核心包
│   ├── runtime-dom       # 浏览器相关的渲染器部分
│   ├── runtime-test      # 渲染器测试相关代码
│   ├── server-renderer   # 服务端渲染相关的包
│   ├── sfc-playground    # 单文件组件演练场
│   ├── shared            # 工具库相关
│   ├── size-check        # 检测代码体积相关
│   ├── template-explorer # 演示模板编译成渲染函数相关的包
│   └── vue               # 包含编译时和运行时的发布包
├── scripts
    ├── bootstrap.js      # 创建packages下的的package.json,README.md,index.js文件
    ├── build.js          # 使用rollup打包生成生产环境下的文件
    ├── dev.js            # 使用esbuild打包生成开发环境下的文件(通过并行处理和优化算法等方式来加速构建速度，因此非常适合用于开发环境)
    ├── filter-e2e.js     # 过滤端到端的测试文件函数
    ├── filter-unit.js    # 过滤单元测试文件函数
    ├── preinstall.js     # 包使用pnpm管理
    ├── release.js        # 运行测试脚本,构建打包文件,publish包
    ├── setupJestEnv.js   # 初始化jest框架,单元测试用例beforeEach,afterEach钩子函数
    ├── utils.js          # 构建的工具函数
    ├── verifyCommit.js   # 对git message合规性进行校验
