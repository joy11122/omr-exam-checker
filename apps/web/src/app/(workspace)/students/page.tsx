import Link from "next/link";
import mongoose from "mongoose";
import { AlertCircle, CheckCircle2, GraduationCap, Search, Upload, UserPlus, Users } from "lucide-react";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/mongodb/client";
import { getCurrentInstitution } from "@/lib/tenancy/current-institution";
import { Student, Membership, Institution } from "@/models";
import { createStudent, deleteStudent, importStudents, updateStudent } from "@/app/actions/students";

type Props = { searchParams: Promise<{ institutionId?: string; q?: string; error?: string; created?: string; updated?: string; deleted?: string; imported?: string }> };
const errors: Record<string,string> = {
  invalid_student: "Check the student details and try again.", forbidden: "You do not have permission for this action.",
  student_code_exists: "That student ID already exists in this institution.", student_create_failed: "Could not add the student.",
  student_update_failed: "Could not update the student.", student_delete_failed: "Could not delete the student.",
  student_not_found: "Student record was not found.", invalid_csv: "CSV format is invalid. Required headers: studentCode, fullName. Maximum 500 rows.",
  some_codes_exist: "Some student IDs already exist. Remove duplicates and retry.", duplicate_codes_in_csv: "The CSV contains duplicate student IDs. Fix the file and import again.", import_failed: "Import failed. Check the CSV and try again.",
};
export default async function StudentsPage({ searchParams }: Props) {
  const params = await searchParams;
  const session = await auth();
  if (!session?.user?.id || !mongoose.isValidObjectId(session.user.id)) return null;
  await connectToDatabase();
  const memberships = await Membership.find({ userId: new mongoose.Types.ObjectId(session.user.id) }).select("institutionId role").lean();
  const institutionIds = memberships.map((m) => m.institutionId);
  const institutions = await Institution.find({ _id: { $in: institutionIds } }).select("name slug").lean();
  const current = await getCurrentInstitution(session.user.id, params.institutionId);
  if (!current) return <section className="management-page"><h1>Students</h1><p>Create an institution first to manage students.</p><Link className="button button-primary" href="/dashboard">Go to dashboard</Link></section>;
  const query = params.q?.trim().slice(0, 80) ?? "";
  const filter: Record<string, unknown> = { institutionId: new mongoose.Types.ObjectId(current.institutionId) };
  if (query) filter.$or = [{ fullName: { $regex: query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }, { studentCode: { $regex: query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }];
  const students = await Student.find(filter).sort({ fullName: 1 }).limit(100).lean();
  const role = String(current.role);
  const canEdit = ["owner","admin","teacher"].includes(role);
  const canDelete = ["owner","admin"].includes(role);
  const success = params.created || params.updated || params.deleted || params.imported;
  return <div className="management-page">
    <div className="page-topline"><span className="eyebrow">PEOPLE MANAGEMENT</span><span className="secure-chip"><Users size={14}/>{current.institution.name}</span></div>
    <section className="management-intro"><p className="muted-copy">Institution roster</p><h1>Students</h1><p>Keep student records organized and ready for exam registration.</p></section>
    <div className="institution-switcher">{institutions.map((item) => <Link key={String(item._id)} className={String(item._id)===current.institutionId?"switcher-link active":"switcher-link"} href={`/students?institutionId=${item._id}`}>{item.name}</Link>)}</div>
    {success ? <div className="form-alert success"><CheckCircle2 size={16}/> Student records updated.</div> : null}
    {params.error && errors[params.error] ? <div className="form-alert error"><AlertCircle size={16}/>{errors[params.error]}</div> : null}
    <section className="management-panel">
      <div className="management-panel-heading"><div><h2>Student directory</h2><p>{students.length} shown · maximum 100 per page</p></div><span className="count-pill">{students.length}</span></div>
      <form className="search-form" action="/students"><input type="hidden" name="institutionId" value={current.institutionId}/><Search size={16}/><input name="q" defaultValue={query} placeholder="Search name or student ID" aria-label="Search students"/><button className="button button-secondary" type="submit">Search</button></form>
      {students.length ? <div className="student-list">{students.map((student) => <article className="student-row" key={String(student._id)}>
        <div className="student-avatar"><GraduationCap size={18}/></div>
        <form action={updateStudent} className="student-edit-form">
          <input type="hidden" name="institutionId" value={current.institutionId}/><input type="hidden" name="studentId" value={String(student._id)}/>
          <input name="fullName" aria-label="Student full name" defaultValue={student.fullName} disabled={!canEdit}/>
          <div className="student-meta-fields"><input name="studentCode" aria-label="Student ID" defaultValue={student.studentCode} disabled={!canEdit}/><input name="className" aria-label="Class" defaultValue={student.className ?? ""} placeholder="Class" disabled={!canEdit}/><input name="section" aria-label="Section" defaultValue={student.section ?? ""} placeholder="Section" disabled={!canEdit}/><input name="email" aria-label="Student email" type="email" defaultValue={student.email ?? ""} placeholder="Student email for result notification" disabled={!canEdit}/></div>
          {canEdit ? <button className="button button-secondary" type="submit">Save</button> : null}
        </form>
        {canDelete ? <form action={deleteStudent}><input type="hidden" name="institutionId" value={current.institutionId}/><input type="hidden" name="studentId" value={String(student._id)}/><button className="icon-danger-button" type="submit" aria-label={`Delete ${student.fullName}`}>×</button></form> : null}
      </article>)}</div> : <div className="empty-state"><span className="empty-icon"><GraduationCap size={22}/></span><strong>No students found</strong><p>Add a student or import a CSV roster.</p></div>}
    </section>
    {canEdit ? <section className="management-grid">
      <div className="management-panel"><div className="management-panel-heading"><div><h2>Add a student</h2><p>Enter a single student record.</p></div><UserPlus size={19}/></div>
        <form action={createStudent} className="management-form"><input type="hidden" name="institutionId" value={current.institutionId}/>
          <label>Full name<input name="fullName" required minLength={2} maxLength={120} placeholder="Student full name"/></label>
          <label>Student ID<input name="studentCode" required maxLength={40} placeholder="STU-001"/></label>
          <div className="form-two-columns"><label>Class<input name="className" maxLength={60} placeholder="Class 10"/></label><label>Section<input name="section" maxLength={40} placeholder="A"/></label></div>
          <div className="form-two-columns"><label>Roll number<input name="rollNumber" maxLength={40} placeholder="01"/></label><label>Phone<input name="phone" maxLength={30} placeholder="+880..."/></label></div>
          <label>Email<input name="email" type="email" maxLength={254} placeholder="student@example.com"/></label>
          <button className="button button-primary" type="submit">Add student <UserPlus size={15}/></button>
        </form>
      </div>
      <div className="management-panel"><div className="management-panel-heading"><div><h2>Import student CSV</h2><p>Upload by pasting CSV data · up to 500 rows.</p></div><Upload size={19}/></div>
        <form action={importStudents} className="management-form"><input type="hidden" name="institutionId" value={current.institutionId}/>
          <label>CSV content<textarea name="csv" rows={9} required placeholder={"studentCode,fullName,className,section,rollNumber,email,phone\nSTU-001,Samira Akter,10,A,1,,\nSTU-002,Rahim Hasan,10,A,2,,"}/></label>
          <p className="helper-copy">Required columns: studentCode, fullName. Optional: className, section, rollNumber, email, phone.</p>
          <button className="button button-secondary" type="submit">Import students <Upload size={15}/></button>
        </form>
      </div>
    </section> : null}
  </div>;
}
