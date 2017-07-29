const recentlyClosed = new Map();

exports.run = (client, payload) => {
  const action = payload.action;
  const issue = payload.issue;
  const repository = payload.repository;
  const payloadBody = payload.comment || issue;
  const inProgress = !issue.labels.find(label => label.name === client.cfg.inProgressLabel);
  if (action === "labeled" && client.cfg.areaLabels) {
    return client.automations.get("areaLabel").run(client, issue, repository, payload.label);
  } else if (action === "closed" && issue.assignees && client.cfg.clearClosedIssues) {
    recentlyClosed.set(issue.id, issue);
    return setTimeout(() => {
      if (recentlyClosed.has(issue.id)) exports.closeIssue(client, issue, repository);
      recentlyClosed.delete(issue.id);
    }, client.cfg.repoEventsDelay);
  } else if (action === "reopened" && recentlyClosed.has(issue.id)) {
    return recentlyClosed.delete(issue.id);
  } else if (inProgress && client.cfg.inProgressLabel && issue.assignees && !issue.pull_request) {
    return client.issues.addLabels({
      owner: repository.owner.login, repo: repository.name, number: issue.number, labels: [client.cfg.inProgressLabel]
    });
  } else if (action === "opened" || action === "created") {
    exports.parseCommands(client, payloadBody, issue, repository);
  }
};

exports.parseCommands = (client, payloadBody, issue, repository) => {
  const commenter = payloadBody.user.login;
  const body = payloadBody.body;
  const issueCreator = issue.user.login;
  if (commenter === client.cfg.username || !body) return;
  const parseCommands = body.match(new RegExp("@" + client.cfg.username + "\\s(\\w*)", "g"));
  if (!parseCommands) return;
  parseCommands.forEach((command) => {
    if (body.includes(`\`${command}\``) || body.includes(`\`\`\`\r\n${command}\r\n\`\`\``)) return;
    let cmdFile = client.commands.get(command.split(" ")[1]);
    if (cmdFile && !cmdFile.args) return cmdFile.run(client, payloadBody, issue, repository);
    else if (!cmdFile || !body.match(/".*?"/g) || (client.cfg.selfLabelingOnly && commenter !== issueCreator)) return;
    const splitBody = body.split(`@${client.cfg.username}`).filter((splitString) => {
      return splitString.includes(` ${command.split(" ")[1]} "`);
    }).join(" ");
    cmdFile.run(client, splitBody, issue, repository);
  });
};

exports.closeIssue = (client, issue, repository) => {
  const issueNumber = issue.number;
  const repoName = repository.name;
  const repoOwner = repository.owner.login;
  issue.assignees.forEach((a) => {
    client.commands.get("abandon").abandon(client, a.login, repoOwner, repoName, issueNumber);
  });
};

exports.events = ["issues", "issue_comment"];
