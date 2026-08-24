from edu.connectors import classroom, moodle

SYNCERS = {
    "moodle": moodle.sync,
    "classroom": classroom.sync,
}
