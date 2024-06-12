// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const fs = require('fs');

const xmlFileStandard = `<?xml version="1.0" encoding="UTF-8"?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>59.0</apiVersion>
    <isExposed>false</isExposed>
</LightningComponentBundle>
`;

const jsFileStandard = `import { LightningElement } from 'lwc';

export default class ___INPUTTED_NAME__ extends LightningElement {
___INPUTTED_TEXT__
}
`;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
async function validateExtensionStart() {

	const selectedText = vscode.window.activeTextEditor.document.getText(vscode.window.activeTextEditor.selection);
	const currentFile = vscode.window.activeTextEditor.document.fileName;
	if(currentFile.search(/.*\.html$/) == -1) { // if they are no in the html file then no point
		failStateError("", 'Please make sure to run from the HTML file');
		return;
	}
	else{
		await vscode.window.showInputBox({
			placeHolder: 'Type in new component name'
		}).then( (userInput) => {
			if(userInput == '') {
				failStateError("", 'Please make sure to input a name');
				return;
			}
			else{
				createComponent(selectedText, currentFile, userInput);
			}
		});
	}	

}

function createComponent(selectedText, currentFile, componentName) {
	// 1 parse the selected html and find all the {WORDS} & the class="WORDS"
	try{ // should have made this a function. oh well.
		const keyJSWords = [];
		const keyCSSWords = [];
		selectedText.split('\n').forEach( (val, ind) => {
			let jsMatch = val.match(/(?<={).*?(?=})/g);
			if(jsMatch) {
				jsMatch.toString().split(',').forEach( val => {
					keyJSWords.push(val.split('.')[0])
				})
			}

			let cssMatch = val.match(/(?<=class\=\").*?(?=\")/g);
			console.log(`cssMatch ${cssMatch}`)
			if(cssMatch) {
				cssMatch.toString().split(',').forEach( val => {
					if(val.includes(' ')) {
						val.split(' ').forEach( element => { // the way classes are set
							keyCSSWords.push(element)
						})
					}
					else{
						keyCSSWords.push(val.split('.')[0])
					}
				})
			}

		});

		// console.log('selectedText.split(\n):' + selectedText.split('\n').length);
		// console.log('keyJSWords:' + keyJSWords);

		// console.log('keyCSSWords:' + keyCSSWords);
		// 2 go to the js file and grab the lines to copy paste...
		let jsLines = [];
		if(keyJSWords) {
			jsLines = getFromJS(keyJSWords, currentFile);
		}
		// 3 also for the css
		let cssLines = [];
		if(keyCSSWords){
			cssLines = getFromCSS(keyCSSWords, currentFile);
		}
		// 4 make the files. move these commetns to the respective functions
		makeChildComponent(jsLines, cssLines, selectedText, currentFile, componentName);
		// 5 comment out the selected
		commentOutSelected(selectedText, '.html', currentFile, componentName);
		if(jsLines) {
			commentOutSelected(jsLines, '.js', currentFile);
		}
		if(cssLines) {
			commentOutSelected(cssLines, '.css', currentFile);
		}
		// 6 put the name component in the old html
		// this got done in teh html commentOutSelected
		// 7 success state
		successfulCompletion(componentName)
	}
	catch(err) {
		failStateError(err);
	}
}

function commentOutSelected(textToComment, textType, currentFile, componentName='') {
	if(textType == '.html') {
		let activeTextEditor = vscode.window.activeTextEditor;
		activeTextEditor.edit((selectedText) => {
			selectedText.replace(activeTextEditor.selection, `${generateNewComponentName(componentName)}<!-- ${textToComment} -->` );
		});
	}
	else {
		editFilesToCommentout(textToComment, textType, currentFile);
	}
}

function generateNewComponentName(inputName) { // will return a string
	let generatedCMPName = 'c-';
	for(let ind = 0; ind < inputName.length; ind++) {
		if(inputName.charAt(ind) == inputName.charAt(ind).toUpperCase()) {
			generatedCMPName = generatedCMPName + inputName.charAt(ind).toLowerCase();
		}
		else {
			generatedCMPName = generatedCMPName + inputName.charAt(ind);
		}
	}
	return '<' + generatedCMPName + '></' + generatedCMPName + '>\n';
}

function editFilesToCommentout(textToComment, textType, currentFile) { 
	console.log(`textToComment: ${JSON.stringify(textToComment)}`);
	let file = currentFile.replace('.html', textType);
	let linesToComment = textToComment.map((val) => { // array of lines
		return {
			commentedLines: commentOutText(val.textToPaste, textType),
			regexLines: val.textToPaste
		};
	});

	let fileText = fs.readFileSync(file, 'utf-8'); // open the file
	linesToComment.forEach( (val) => {
		fileText = fileText.replace(val.regexLines, val.commentedLines)
	});

	fs.writeFileSync(file, fileText); // write the new file

}

function commentOutText(text, textType) {
	if(textType === '.css' && text) {
		return `/* ${text} */`
	}
	else if(textType == '.js') {
		return text.split('\n').map((line) => {
			return`//${line}\n`
		}).join('');
	}
}

function getFromJS(keyWords, currentFile) { 
	// remember the currentFile is the html file
	let jsFile = currentFile.replace('.html', '.js');
	if(keyWords) {
		return genericGetFromText(keyWords, fs.readFileSync(jsFile, 'utf-8'), false, true);
	}
	else{
		return [];
	}
}

function getFromCSS(keyWords, currentFile) {
	// css files are not _required_ sooo try catch it is
	let cssFile = currentFile.replace('.html', '.css');
	try {
		if(keyWords) {
			return genericGetFromText(keyWords, fs.readFileSync(cssFile, 'utf-8'), true);
		}
		else{
			return [];
		}
	}
	catch(err) { // this is redundant
		return {
			lineStart: 0,
			lineEnd: 0,
			textToPaste: '// nothing here',
			contains: false
		};
	}
}

function genericGetFromText(keyWords, dataToParse, notLWC, passThrough=false) {
	if(keyWords.length === 0) {
		return [];
	}
	let reg = new RegExp(keyWords.join("|")); // the g kept messing things up
	console.log(`notLWC: ${notLWC}\nreg: ${reg}\n passThrough: ${passThrough}`)
	let currStack = [];
	let inLWC = notLWC; // this is to dictate if we can just start tracking lines -- js file starts as false
	let trackedLines = [];
	let currKeyWords2 = []; // to clean is when it pops
	let keyWords2 = []; // for the second lwc pass
	let currTrack = {
		lineStart: 0,
		lineEnd: -1,
		textToPaste: '',
		contains: false
	};

	dataToParse.toString().split('\n').forEach( (line, ind) => {
////--------
		if(inLWC) {
			// first check hte { }
			if(line.includes('{')) {
				if(reg.test(line)) {
					currTrack.contains = true;
				}
				if(currStack.length === 0) {
					currTrack.lineStart = ind;
					currTrack.textToPaste = '';
					currKeyWords2 = [];
				}
				line.match(/\{/g).forEach(element => {
					currStack.push('{');
				});
				currTrack.textToPaste = currTrack.textToPaste + line + '\n';

				if(passThrough) { // only when in the first pass /// needs to be within { } or a contains = true line
					if(line.match(/(?<=this\.).*?(?=\.| |;|\\n|\()/g)) { // otherwise it iterates over null
						console.log(`pushed data! ${line}}`)

						line.match(/(?<=this\.).*?(?=\.| |;|\\n|\()/g).forEach( (val) => { //error here
							if(!keyWords.includes(val)){
								currKeyWords2.push(val)
							}
						})
					}
				}

				if(line.includes('}')) {

					line.match(/\}/g).forEach(element => {
						currStack.pop()
						if(currStack.length == 0 && currTrack.contains) {
							if(currKeyWords2) {
								// console.log(`currKeyWords2 ${currKeyWords2}`)
								keyWords2.push(...currKeyWords2);
							}

							currTrack.lineEnd = ind;
							trackedLines.push({
								lineStart: currTrack.lineStart,
								lineEnd: currTrack.lineEnd,
								textToPaste: currTrack.textToPaste,
								cotains: true,
								regexInvolved: String(reg),
								indexFound: 234,
								currKeyWords2: currKeyWords2
							})
							currTrack.lineStart = ind + 1; // next line
							currTrack.contains = false;
							currTrack.textToPaste = '';
							currKeyWords2 = [];
							return;
						}
					});
				}
			}
			else if(line.includes('}')) {
				if(reg.test(line)) {
					currTrack.contains = true;
				}
				currTrack.textToPaste = currTrack.textToPaste + line + '\n';

				if(passThrough) { // only when in the first pass /// needs to be within { } or a contains = true line
					if(line.match(/(?<=this\.).*?(?=\.| |;|\\n|\()/g)) { // otherwise it iterates over null
						line.match(/(?<=this\.).*?(?=\.| |;|\\n|\()/g).forEach( (val) => { 
							if(!keyWords.includes(val)){
								currKeyWords2.push(val)
							}
						})
					}
				}

				line.match(/\}/g).forEach(element => {
					currStack.pop()
					if(currStack.length == 0 && currTrack.contains) {
						if(currKeyWords2) {
							// console.log(`currKeyWords2 284 ${currKeyWords2}`)
							keyWords2.push(...currKeyWords2)							
						}

						currTrack.lineEnd = ind;
						trackedLines.push({
							lineStart: currTrack.lineStart,
							lineEnd: currTrack.lineEnd,
							textToPaste: currTrack.textToPaste,
							cotains: true,
							regexInvolved: String(reg),
							indexFound: 292,
							currKeyWords2: currKeyWords2
						})
						currTrack.lineStart = ind + 1;
						currTrack.contains = false;
						currTrack.textToPaste = '';
						currKeyWords2 = [];
						return;
					}
					else if(currStack.length === 0) { 
						currTrack.textToPaste = '';
						currTrack.lineStart = ind + 1;
						currKeyWords2 = [];
					}
				})
			}
			else if(reg.test(line)) { // just check if contains
				if(passThrough == false) console.log(line)
				currTrack.textToPaste = currTrack.textToPaste + line + '\n';
				currTrack.contains = true;
				if(currStack.length === 0) {
					trackedLines.push({
						lineStart: ind,
						lineEnd: ind,
						textToPaste: currTrack.textToPaste,
						cotains: true,
						regexInvolved: String(reg),
						indexFound: 'line 281',
						currKeyWords2: currKeyWords2
					});
					currTrack.textToPaste = '';
					currTrack.contains = false;
					currTrack.lineStart = ind + 1;
					return;
				}
			}
			else if(currStack.length) {
				currTrack.textToPaste = currTrack.textToPaste + line + '\n';
				if(passThrough) { // only when in the first pass /// needs to be within { } or a contains = true line
					if(line.match(/(?<=this\.).*?(?=\.| |;|\\n|\()/g)) { // otherwise it iterates over null
						line.match(/(?<=this\.).*?(?=\.| |;|\\n|\()/g).forEach( (val) => { 
							if(!keyWords.includes(val)){
								currKeyWords2.push(val)
							}
						})
					}
				}
			}

		}
		else if(line.includes('export default')) {
			inLWC = true;
			currTrack.lineStart = ind+1;
			return; // skip this line 
		}

	})

	if(inLWC && passThrough && keyWords2.length > 0) {
		console.log(`Second Pass`);
		trackedLines.push(...genericGetFromText(keyWords2, dataToParse, false));
	}

	return trackedLines
}

function makeChildComponent(jsLines, cssLines, selectedText, currentFile, componentName) {
	try{
		// folder first
		let tempSplit = currentFile.split('/');
		tempSplit.pop();
		tempSplit.pop();
		let lwcPath = tempSplit.join('/') + '/' + componentName;
		fs.mkdirSync(lwcPath); 
		//css file 
		if(cssLines) {
			fs.appendFileSync(lwcPath + '/' + componentName + '.css', formatText(cssLines));
		}
		// js file
		if(jsLines) {
			fs.appendFileSync(lwcPath + '/' + componentName + '.js', jsFileStandard.replace(`___INPUTTED_NAME__`, componentName).replace(`___INPUTTED_TEXT__`,textJSFilterFormatter(jsLines)));
		}
		// html file
		if(selectedText) {
			fs.appendFileSync(lwcPath + '/' + componentName + '.html', selectedText);
		}
		// xml file
		fs.appendFileSync(lwcPath + '/' + componentName + '.xml', xmlFileStandard)
	}
	catch(err) {
		throw new Error(err);
	}
}

function formatText(textList) {
	let stringToReturn = '';
	textList.forEach( (val, ind) => {
		stringToReturn = stringToReturn + val.textToPaste + '\n';
	});
	return stringToReturn;
}

function textJSFilterFormatter(textList) {
	// to remove duplicates
	let carriedStartList = [];
	let carriedEndList = []
	let filteredList = textList.filter((lines) =>{
		if(carriedStartList.includes(lines.lineStart) && carriedEndList.includes(lines.lineEnd)) {
			return false;
		}
		else{
			carriedStartList.push(lines.lineStart);
			carriedEndList.push(lines.lineEnd);
			return true;
		}
	});
	return formatText(filteredList);
}

function failStateError(errInputted, errText) {
	if(errInputted) {
		console.error(errInputted);
	}
	if(errText){
		vscode.window.showInformationMessage(errText);
	}
}

function successfulCompletion(cmpName) {
	vscode.window.showInformationMessage(`Succesfully created LWC component: ${cmpName}`)
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	console.log('Congratulations, extension "lwc-component-extractor" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('lwc-component-extractor.extract', validateExtensionStart);

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
