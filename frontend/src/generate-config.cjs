const fs = require('fs');
const path = require('path');

// Inline application configuration to avoid import issues
const applicationConfig = {
    name: 'Event Scheduling Platform',
    camelCase: 'EventScheduling',
    kebakCase: 'event-scheduling',
    cwLogGroupeNamePrefix: '/aws/event-scheduling',
    tagValue: 'event-scheduling-platform',
    tagKey: 'application',
};

// Define the path to the output.json file
const outputFilePath = path.join(__dirname, '../output.json');

function readOutputJson() {
    try {
        const stats = fs.statSync(outputFilePath);
        
        // Use streaming for large files
        if (stats.size > 1024 * 1024) { // 1MB threshold
            let data = '';
            const stream = fs.createReadStream(outputFilePath, { encoding: 'utf8' });
            
            return new Promise((resolve, reject) => {
                stream.on('data', chunk => data += chunk);
                stream.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error(`Invalid JSON: ${e.message}`));
                    }
                });
                stream.on('error', reject);
            });
        }
        
        // Synchronous read for small files
        return JSON.parse(fs.readFileSync(outputFilePath, 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT') throw new Error(`File not found: ${outputFilePath}`);
        if (error.code === 'EACCES') throw new Error(`Permission denied: ${outputFilePath}`);
        throw error;
    }
}

(async () => {
    const outputJson = await readOutputJson();
    console.log('Output in cjs JSON:', outputJson);

    // Create stack name function using inline configuration
    const prefixedStackName = (name) => `${applicationConfig.camelCase}-${name}`;
    
    // Generate the middleware stack name dynamically
    const middlewareStackName = prefixedStackName('MiddlewareStack');
    console.log('Using stack name:', middlewareStackName);

    // Check if the stack exists in the output JSON
    if (!outputJson[middlewareStackName]) {
        console.error(`Stack '${middlewareStackName}' not found in output.json`);
        console.error('Available stacks:', Object.keys(outputJson));
        process.exit(1);
    }

    // Extract the required values using dynamic stack name
    const GraphqlApiUrl = outputJson[middlewareStackName].GraphqlApiUrl;
    const CognitoUserPoolId = outputJson[middlewareStackName].CognitoUserPoolId;
    const CognitoUserPoolClientId = outputJson[middlewareStackName].CognitoUserPoolClientId;
    const CognitoIdentityPoolId = outputJson[middlewareStackName].CognitoIdentityPoolId;

    if (!GraphqlApiUrl || !CognitoUserPoolId || !CognitoUserPoolClientId || !CognitoIdentityPoolId) {
        console.error('Missing required output values from CDK deployment');
        console.error('Available outputs:', Object.keys(outputJson[middlewareStackName] || {}));
        process.exit(1);
    }

    const awsmobile = {
        "aws_project_region": process.env.AWS_REGION || 'eu-west-3',
        "aws_appsync_graphqlEndpoint": GraphqlApiUrl,
        "aws_appsync_region": process.env.AWS_REGION || 'eu-west-3',
        "aws_cognito_identity_pool_id": CognitoIdentityPoolId,
        "aws_cognito_region": process.env.AWS_REGION || 'eu-west-3',
        "aws_user_pools_id": CognitoUserPoolId,
        "aws_user_pools_web_client_id": CognitoUserPoolClientId,
        "oauth": {
            "redirectSignIn": "MY-HOST/home/",
        },
        "aws_cognito_username_attributes": ["EMAIL"],
        "aws_cognito_social_providers": [],
        "aws_cognito_signup_attributes": ["EMAIL"],
        "aws_cognito_mfa_configuration": "OFF",
        "aws_cognito_mfa_types": ["SMS"],
        "aws_cognito_password_protection_settings": {
            "passwordPolicyMinLength": 8,
            "passwordPolicyCharacters": []
        },
        "aws_cognito_verification_mechanisms": ["EMAIL"]
    };

    const awsExportsContent = `const awsmobile = ${JSON.stringify(awsmobile, null, 2)};\nexport default awsmobile;`;
    fs.writeFileSync(path.join(__dirname, 'aws-exports.ts'), awsExportsContent);
    console.log('aws-exports.js has been generated successfully.');
})();


