from edu.connectors import classroom, compasso, cowork, moodle

SYNCERS = {
    "moodle": moodle.sync,
    "classroom": classroom.sync,
    "compasso": compasso.sync,
    "cowork": cowork.sync,
}
