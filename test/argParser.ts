type TestParams = {
    runDeposit: boolean;
    runIncreasePosition: number;
    runDecreasePosition: number;
  };
  
  export function getTestParams(): TestParams {
    const args = process.argv.slice(2);
    const params: Partial<TestParams> = {
      runDeposit: false,
      runIncreasePosition: 0,
      runDecreasePosition: 0,
    };
    
    args.forEach(arg => {
      if (arg.startsWith('--')) {
        const [key, value] = arg.slice(2).split('=');
        if (key && value !== undefined) {
          switch (key) {
            case 'runDeposit':
              params.runDeposit = value === 'true';
              break;
            case 'runIncreasePosition':
              params.runIncreasePosition = parseInt(value, 10);
              break;
            case 'runDecreasePosition':
              params.runDecreasePosition = parseInt(value, 10);
              break;
            default:
              break;
          }
        }
      }
    });
    
    return params as TestParams;
  }
  