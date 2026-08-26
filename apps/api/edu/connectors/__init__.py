from edu.connectors import classroom, compasso, moodle

SYNCERS = {
    "moodle": moodle.sync,
    "classroom": classroom.sync,
    "compasso": compasso.sync,
}
