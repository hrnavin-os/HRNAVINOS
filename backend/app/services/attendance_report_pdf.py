"""The batch attendance report, as a PDF.

One row per student, one column per class held so far (classes still to come
are left off), each cell what the portal shows for it: L (live), R
(recording), P (marked present by staff), A (absent). Then the student's total
and percentage, and whether they have signed the terms.

Built with fpdf2's core Helvetica, which only carries Latin-1. Names are typed
by people and can hold anything, so text is folded into Latin-1 on the way
in rather than failing the whole report on one character.

A batch can run to more classes than fit across a landscape page; the class
columns then continue on further pages, each repeating the names, so every
page can be read on its own.
"""
from datetime import date

from fpdf import FPDF

from app.models.class_session import resolve
from app.schemas.student_portal_schema import BatchRosterResponse

NAME_WIDTH = 52
TOTAL_WIDTH = 16
PERCENT_WIDTH = 14
TERMS_WIDTH = 12
CLASS_WIDTH = 8
ROW_HEIGHT = 6
# A4 landscape is 297mm; 10mm margins either side.
USABLE_WIDTH = 277
CLASSES_PER_PAGE = (USABLE_WIDTH - NAME_WIDTH - TOTAL_WIDTH - PERCENT_WIDTH - TERMS_WIDTH) // CLASS_WIDTH

CELL_CODES = {"live": "L", "recording": "R", "manual": "P"}
# Fills for the cells, light enough that the letter stays readable in print.
FILLS = {"L": (220, 252, 231), "R": (219, 234, 254), "P": (237, 233, 254), "A": (254, 226, 226)}


def _text(value: object) -> str:
    return str(value).encode("latin-1", "replace").decode("latin-1")


def _cell_code(attended: bool | None, via: str | None) -> str:
    if attended is None:
        return ""
    if attended:
        return CELL_CODES.get(via or "", "P")
    return "A"


class _Report(FPDF):
    def __init__(self, title: str, subtitle: str) -> None:
        super().__init__(orientation="L", unit="mm", format="A4")
        self.report_title = title
        self.report_subtitle = subtitle
        self.set_margins(10, 12, 10)
        self.set_auto_page_break(auto=True, margin=14)

    def header(self) -> None:
        self.set_font("Helvetica", "B", 13)
        self.cell(0, 7, _text(self.report_title), new_x="LMARGIN", new_y="NEXT")
        self.set_font("Helvetica", "", 9)
        self.set_text_color(90, 90, 90)
        self.cell(0, 5, _text(self.report_subtitle), new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(0, 0, 0)
        self.ln(2)

    def footer(self) -> None:
        self.set_y(-10)
        self.set_font("Helvetica", "", 7)
        self.set_text_color(120, 120, 120)
        legend_width = self.epw - 30
        self.cell(
            legend_width,
            5,
            "L live class  -  R watched the recording  -  P marked present by staff  -  A absent",
            align="L",
        )
        self.cell(30, 5, f"Page {self.page_no()}/{{nb}}", align="R")
        self.set_text_color(0, 0, 0)


def build_attendance_pdf(roster: BatchRosterResponse, rows: dict, *, generated_on: date) -> bytes:
    """`rows` maps (session_id, student_id) to that SessionAttendance, as
    StudentPortalService._rows_for returns it."""
    batch = roster.batch
    held_sessions = [session for session in roster.sessions if session.held]
    subtitle = " | ".join(
        part
        for part in (
            batch.course_name,
            # A batch opened from the leads has no dates until staff give it them.
            f"{batch.start_date:%d %b %Y} - {batch.end_date:%d %b %Y}"
            if batch.start_date and batch.end_date
            else None,
            f"{len(roster.students)} students",
            f"{len(held_sessions)} of {len(roster.sessions)} classes held",
            f"Generated {generated_on:%d %b %Y}",
        )
        if part
    )
    pdf = _Report(f"Attendance report - {batch.name}", subtitle)

    chunks = [held_sessions[i : i + CLASSES_PER_PAGE] for i in range(0, len(held_sessions), CLASSES_PER_PAGE)] or [[]]
    for index, chunk in enumerate(chunks):
        pdf.add_page()
        last = index == len(chunks) - 1
        if len(chunks) > 1:
            pdf.set_font("Helvetica", "I", 8)
            pdf.cell(
                0, 5, f"Classes {chunk[0].sequence}-{chunk[-1].sequence}" if chunk else "", new_x="LMARGIN", new_y="NEXT"
            )

        pdf.set_font("Helvetica", "B", 8)
        pdf.set_fill_color(241, 245, 249)
        pdf.cell(NAME_WIDTH, ROW_HEIGHT, "Student", border=1, fill=True)
        for session in chunk:
            pdf.cell(CLASS_WIDTH, ROW_HEIGHT, str(session.sequence), border=1, align="C", fill=True)
        if last:
            pdf.cell(TOTAL_WIDTH, ROW_HEIGHT, "Attended", border=1, align="C", fill=True)
            pdf.cell(PERCENT_WIDTH, ROW_HEIGHT, "%", border=1, align="C", fill=True)
            pdf.cell(TERMS_WIDTH, ROW_HEIGHT, "T&C", border=1, align="C", fill=True)
        pdf.ln()

        pdf.set_font("Helvetica", "", 8)
        for student in roster.students:
            name = student.name if student.status != "dropped" else f"{student.name} (dropped)"
            pdf.cell(NAME_WIDTH, ROW_HEIGHT, _text(name)[:34], border=1)
            for session in chunk:
                attended, via = resolve(rows.get((session.id, student.id)), held=True)
                code = _cell_code(attended, via)
                fill = FILLS.get(code)
                if fill:
                    pdf.set_fill_color(*fill)
                pdf.cell(CLASS_WIDTH, ROW_HEIGHT, code, border=1, align="C", fill=bool(fill))
            if last:
                totals = student.totals
                pdf.cell(TOTAL_WIDTH, ROW_HEIGHT, f"{totals.attended}/{totals.held}", border=1, align="C")
                percent = "-" if totals.percent is None else f"{totals.percent:g}"
                pdf.cell(PERCENT_WIDTH, ROW_HEIGHT, percent, border=1, align="C")
                pdf.cell(TERMS_WIDTH, ROW_HEIGHT, "Yes" if student.terms_signed else "No", border=1, align="C")
            pdf.ln()

    if held_sessions:
        pdf.ln(4)
        pdf.set_font("Helvetica", "B", 8)
        pdf.cell(0, 5, "Classes", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 8)
        for session in held_sessions:
            line = (
                f"{session.sequence}. {session.title} - {session.held_on:%d %b %Y}: "
                f"{session.present_count} present ({session.live_count} live, {session.recording_count} recording), "
                f"{session.absent_count} absent"
            )
            pdf.cell(0, 4.5, _text(line), new_x="LMARGIN", new_y="NEXT")

    return bytes(pdf.output())
