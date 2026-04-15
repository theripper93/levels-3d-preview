const { execSync } = require('child_process');

// The last argument is the action, everything in between is a directory
const args = process.argv.slice(2);
const action = args.pop(); 
const directories = args;

if (directories.length === 0 || !['ignore', 'update'].includes(action)) {
    console.error('Usage: node git-index.js <dir1> <dir2> ... <ignore|update>');
    process.exit(1);
}

const flag = action === 'ignore' ? '--skip-worktree' : '--no-skip-worktree';

try {
    let allFiles = [];

    // Collect files from all provided directories
    directories.forEach(dir => {
        try {
            const output = execSync(`git ls-files ${dir}`, { encoding: 'utf8' }).trim();
            if (output) {
                const files = output.split(/\r?\n/);
                allFiles = allFiles.concat(files);
            }
        } catch (e) {
            console.warn(`Warning: Could not read directory "${dir}". Skipping...`);
        }
    });

    if (allFiles.length > 0) {
        // Wrap filenames in quotes to handle spaces
        const formattedFiles = allFiles.map(f => `"${f}"`).join(' ');
        
        execSync(`git update-index ${flag} ${formattedFiles}`);
        console.log(`Successfully applied ${flag} to ${allFiles.length} files across ${directories.length} directories.`);
    } else {
        console.log('No files found to process.');
    }

} catch (error) {
    console.error('Error executing git command:', error.message);
    process.exit(1);
}