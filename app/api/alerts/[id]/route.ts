import {updateAlert,deleteAlert} from '../../../lib/alert-api';
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){return updateAlert(request,(await params).id);}
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){return deleteAlert(request,(await params).id);}
